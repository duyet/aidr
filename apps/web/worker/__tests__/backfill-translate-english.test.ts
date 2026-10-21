import type { WorkflowStep } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  function recheckCtx(stored: (typeof engine)[]) {
    const written: unknown[][] = [];
    const prepare = (sql: string) => {
      const stmt = {
        sql,
        args: [] as unknown[],
        bind: (...args: unknown[]) => {
          stmt.args = args;
          return stmt;
        },
        all: async () => ({
          results: sql.includes("JOIN translations") ? stored : [],
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
          for (const s of stmts)
            if (s.sql.startsWith("INSERT INTO translations"))
              written.push(s.args);
          return [];
        },
      },
    } as unknown as Env;
    const out: IngestContext = {
      step,
      env,
      runId: "r1",
      steps: [],
      mode: LIVE_FULL_RUN,
    };
    return { ctx: out, written };
  }

  it("re-translates a calqued row and stores the fix", async () => {
    const translate = vi.spyOn(llm, "translateItems").mockResolvedValue([
      {
        i: 0,
        title: "DeepSeek mã nguồn mở inference engine của mình",
        summary: "DeepInfer: inference engine hiệu năng cao cho DeepSeek",
        tokens: 1,
        model: "a/m",
      },
    ]);
    const { ctx: c, written } = recheckCtx([engine, clean]);

    const out = await backfillTranslations(c);

    expect(translate.mock.calls[0][1].map((item) => item.title)).toEqual([
      engine.title,
    ]);
    expect(out.translated).toBe(1);
    expect(written.map((args) => args[0])).toEqual(["be38b11f"]);
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
    const { ctx: c, written } = recheckCtx([engine]);

    await backfillTranslations(c);

    expect(written).toEqual([]);
  });
});
