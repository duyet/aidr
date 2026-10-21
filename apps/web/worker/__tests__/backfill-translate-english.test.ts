import type { WorkflowStep } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKFILL_TRANSLATE_CAP, RECHECK_TRANSLATE_CAP } from "../backfill.js";
import { backfillTranslations } from "../ingest/backfill-translate.js";
import type { IngestContext } from "../ingest/context.js";
import { LIVE_FULL_RUN } from "../ingest/mode.js";
import * as llm from "../llm.js";
import type { Env } from "../types.js";

const step = {
  do: async (_name: string, ...rest: unknown[]) =>
    (rest.at(-1) as () => Promise<unknown>)(),
} as unknown as WorkflowStep;

function ctx(missing: { id: string; title: string; summary: string | null }[]) {
  const stmt = {
    bind: () => stmt,
    all: async () => ({
      results: missing.map((m) => ({ ...m, source_lang: "en" })),
    }),
    run: async () => ({ meta: { changes: 1 } }),
    first: async () => null,
  };
  const env = {
    DB: { prepare: () => stmt, batch: async () => [] },
  } as unknown as Env;
  const out: IngestContext = {
    step,
    env,
    runId: "r1",
    steps: [],
    mode: LIVE_FULL_RUN,
  };
  return out;
}

describe("backfill-translate English-in-VI tally", () => {
  afterEach(() => vi.restoreAllMocks());

  it("counts each written row against the model that wrote it", async () => {
    vi.spyOn(llm, "translateItems").mockResolvedValue([
      { i: 0, title: "Tin mới", summary: "Tóm tắt.", tokens: 1, model: "a/m" },
      {
        i: 1,
        title: "Tin dở",
        summary: "A summary left in English.",
        tokens: 1,
        model: "a/m",
      },
      { i: 2, title: "Tin khác", summary: "Tóm tắt.", tokens: 1, model: "b/m" },
    ]);
    const missing = [0, 1, 2].map((i) => ({
      id: `item-${i}`,
      title: `Story ${i}`,
      summary: "An English summary.",
    }));

    const out = await backfillTranslations(ctx(missing));

    expect(out.translated).toBe(3);
    expect(out.viEnglish).toEqual({
      "a/m": { translated: 2, english: 1 },
      "b/m": { translated: 1, english: 0 },
    });
  });
});

describe("backfill-translate source without a summary", () => {
  afterEach(() => vi.restoreAllMocks());

  // D1 returns NULL for a title-only story (HN). Passed on as null, it made
  // the summary batch throw, and every story in that batch was retried
  // titles-only, which stored their Vietnamese summaries as empty.
  it("sends a NULL source summary as no summary", async () => {
    const translate = vi.spyOn(llm, "translateItems").mockResolvedValue([]);

    await backfillTranslations(
      ctx([
        { id: "title-only", title: "Gemini 3.8 Flash", summary: null },
        { id: "full", title: "Story", summary: "An English summary." },
      ])
    );

    const [, sent] = translate.mock.calls[0];
    expect(sent.map((item) => item.summary)).toEqual([
      undefined,
      "An English summary.",
    ]);
  });
});

// Prod be38b11f and 2935c1e5 (#1021): a row stored before its term rule
// existed, or whose one repair at generation was skipped, stayed wrong for
// good. Backfill re-checks stored rows and re-translates the flagged ones.
describe("backfill-translate re-checks stored VI rows", () => {
  afterEach(() => vi.restoreAllMocks());

  const engine = {
    id: "be38b11f",
    title: "DeepSeek just open-sourced its inference engine",
    summary: "DeepInfer: High-performance inference engine for DeepSeek models",
    source_lang: "en",
    vi_title: "DeepSeek vừa mã nguồn mở engine suy diễn của nó",
    vi_summary:
      "DeepInfer: Khung suy diễn hiệu năng cao cho các mô hình DeepSeek",
  };
  const clean = {
    id: "clean",
    title: "OpenAI ships a new model",
    summary: "OpenAI released a new model today.",
    source_lang: "en",
    vi_title: "OpenAI ra mắt mô hình mới",
    vi_summary: "OpenAI đã phát hành một mô hình mới hôm nay.",
  };
  const calqued = (id: string) => ({ ...engine, id });
  const fixed = {
    title: "DeepSeek mã nguồn mở inference engine của mình",
    summary: "DeepInfer: inference engine hiệu năng cao cho DeepSeek",
    tokens: 1,
    model: "a/m",
  };

  /** A D1 fake that keeps `translation_rechecks` across runs, the way the
   * stored-row query's LEFT JOIN reads it. */
  function fakeDb(
    stored: (typeof engine)[],
    missing: { id: string; title: string; summary: string }[] = []
  ) {
    const rechecked = new Set<string>();
    const batches: { sql: string; args: unknown[] }[][] = [];
    const prepare = (sql: string) => {
      const stmt = {
        sql,
        args: [] as unknown[],
        bind: (...args: unknown[]) => {
          stmt.args = args;
          return stmt;
        },
        all: async () => ({
          results: sql.includes("translation_rechecks")
            ? stored.filter((row) => !rechecked.has(row.id))
            : sql.includes("FROM items i")
              ? missing.map((row) => ({ ...row, source_lang: "en" }))
              : [],
        }),
        run: async () => ({ meta: { changes: 1 } }),
        first: async () => null,
      };
      return stmt;
    };
    const env = {
      DB: {
        prepare,
        batch: async (stmts: { sql: string; args: unknown[] }[]) => {
          batches.push(stmts);
          for (const s of stmts)
            if (s.sql.startsWith("INSERT INTO translation_rechecks"))
              rechecked.add(String(s.args[0]));
          return [];
        },
      },
    } as unknown as Env;
    const ctx = (): IngestContext => ({
      step,
      env,
      runId: "r1",
      steps: [],
      mode: LIVE_FULL_RUN,
    });
    const written = () =>
      batches
        .flat()
        .filter((s) => s.sql.startsWith("INSERT INTO translations"))
        .map((s) => s.args[0]);
    return { ctx, batches, written };
  }

  const sentTitles = (translate: { mock: { calls: unknown[][] } }) =>
    translate.mock.calls.map((call) =>
      (call[1] as { title: string }[]).map((item) => item.title)
    );

  it("re-translates a calqued row and stores the fix", async () => {
    const translate = vi
      .spyOn(llm, "translateItems")
      .mockResolvedValue([{ i: 0, ...fixed }]);
    const db = fakeDb([engine, clean]);

    const out = await backfillTranslations(db.ctx());

    expect(sentTitles(translate)).toEqual([[engine.title]]);
    expect(out.translated).toBe(1);
    expect(db.written()).toEqual(["be38b11f"]);
  });

  // Rollback: the replaced VI text must be recoverable, so the overwrite
  // logs the old field values in the same batch, before the upsert.
  it("logs the replaced VI text before overwriting it", async () => {
    vi.spyOn(llm, "translateItems").mockResolvedValue([{ i: 0, ...fixed }]);
    const db = fakeDb([engine]);

    await backfillTranslations(db.ctx());

    const upsert = db.batches.find((b) =>
      b.some((s) => s.sql.startsWith("INSERT INTO translations"))
    );
    expect(upsert?.map((s) => s.sql.split("(")[0].trim())).toEqual([
      "INSERT INTO item_content_log",
      "INSERT INTO item_content_log",
      "INSERT INTO translations",
    ]);
  });

  it("keeps the stored row when the retry is no better", async () => {
    vi.spyOn(llm, "translateItems").mockResolvedValue([
      {
        i: 0,
        title: engine.vi_title,
        summary: engine.vi_summary,
        tokens: 1,
        model: "a/m",
      },
    ]);
    const db = fakeDb([engine]);

    await backfillTranslations(db.ctx());

    expect(db.written()).toEqual([]);
  });

  // The verifier's head-of-line case: rows the model cannot fix were sent
  // every run for 2 days and kept the other flagged rows from the slot.
  it("does not send a row the model could not fix a second time", async () => {
    const stuck = vi.spyOn(llm, "translateItems").mockResolvedValue([]);
    const db = fakeDb([engine]);

    await backfillTranslations(db.ctx());
    await backfillTranslations(db.ctx());

    expect(sentTitles(stuck)).toEqual([[engine.title]]);
  });

  it("gives the next run's slot to the flagged rows not tried yet", async () => {
    const translate = vi.spyOn(llm, "translateItems").mockResolvedValue([]);
    const rows = ["a", "b", "c", "d"].map(calqued);
    const db = fakeDb(rows);

    await backfillTranslations(db.ctx());
    await backfillTranslations(db.ctx());

    const sizes = translate.mock.calls.map((call) => call[1].length);
    expect(sizes).toEqual([3, 1]);
  });

  it("sends at most one recheck batch per run", async () => {
    const translate = vi.spyOn(llm, "translateItems").mockResolvedValue([]);
    const db = fakeDb(["a", "b", "c", "d", "e", "f", "g"].map(calqued));

    await backfillTranslations(db.ctx());

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][1]).toHaveLength(RECHECK_TRANSLATE_CAP);
  });

  it("skips the recheck when the run hit BACKFILL_TRANSLATE_CAP", async () => {
    const missing = Array.from({ length: BACKFILL_TRANSLATE_CAP }, (_, i) => ({
      id: `m${i}`,
      title: `Story ${i}`,
      summary: "An English summary.",
    }));
    const translate = vi
      .spyOn(llm, "translateItems")
      .mockImplementation(async (_env, items) =>
        items.map((item) => ({
          i: item.i,
          title: "Tin mới",
          summary: "Tóm tắt.",
          tokens: 1,
          model: "a/m",
        }))
      );
    const db = fakeDb([engine], missing);

    await backfillTranslations(db.ctx());

    expect(sentTitles(translate).flat()).not.toContain(engine.title);
  });

  // A batch with rows missing from the answer is a 429, a spent credit or a
  // timeout: spending more calls on a recheck in that run makes it worse.
  it("skips the recheck when a translate batch of the run failed", async () => {
    const translate = vi.spyOn(llm, "translateItems").mockResolvedValue([]);
    const db = fakeDb(
      [engine],
      [{ id: "m0", title: "Story", summary: "An English summary." }]
    );

    await backfillTranslations(db.ctx());

    expect(sentTitles(translate)).toEqual([["Story"]]);
  });

  it("skips the recheck when a translate batch threw", async () => {
    const translate = vi
      .spyOn(llm, "translateItems")
      .mockRejectedValue(new Error("anyrouter chain exhausted"));
    const db = fakeDb(
      [engine],
      [{ id: "m0", title: "Story", summary: "An English summary." }]
    );

    await backfillTranslations(db.ctx());

    expect(sentTitles(translate)).toEqual([["Story"]]);
  });
});
