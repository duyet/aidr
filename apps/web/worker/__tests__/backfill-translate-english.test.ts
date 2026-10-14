import type { WorkflowStep } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backfillTranslations } from "../ingest/backfill-translate.js";
import type { IngestContext } from "../ingest/context.js";
import { LIVE_FULL_RUN } from "../ingest/mode.js";
import * as llm from "../llm.js";
import type { Env } from "../types.js";

/** Runs every step callback inline, as a first (non-replay) run does. */
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
