import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: class {
    env: unknown;
    constructor(_ctx: unknown, env: unknown) {
      this.env = env;
    }
  },
}));
vi.mock("../bugsink.js", async (importActual) => ({
  ...(await importActual<typeof import("../bugsink.js")>()),
  bindSentry: vi.fn(),
  reportPipelineException: vi.fn(async () => {}),
}));
vi.mock("../health.js", () => ({ runHealthCheck: vi.fn(async () => []) }));
vi.mock("../llm.js", () => ({
  setLlmCallLogger: vi.fn(),
  withLlmCallContext: (_id: string, fn: () => unknown) => fn(),
}));
vi.mock("../llm-call-log.js", () => ({
  createD1LlmCallLogger: vi.fn(),
  pruneLlmCalls: vi.fn(async () => {}),
  flushLlmCallWrites: vi.fn(async () => {}),
  withRunLlmCallLogger: (_env: unknown, _id: string, fn: () => unknown) => fn(),
}));
vi.mock("../media-schema.js", () => ({
  assertMediaManifestSchema: vi.fn(async () => {}),
  isMediaManifestSchemaError: () => false,
}));
vi.mock("../rate-limit.js", () => ({
  pruneSubscribeAttempts: vi.fn(async () => {}),
}));

const rows = [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }];
vi.mock("../ingest/fetch.js", () => ({
  loadSources: vi.fn(async () => []),
  seedSourceHealth: vi.fn(),
  fetchSources: vi.fn(async () => ({
    itemsFetched: 3,
    fetchedBySource: new Map(),
    fetchFailures: new Map(),
  })),
}));
vi.mock("../ingest/dedupe.js", () => ({
  dedupeNewRows: vi.fn(async () => rows),
}));
vi.mock("../ingest/enrich.js", () => ({
  enrichNewRows: vi.fn(async () => rows),
}));
vi.mock("../ingest/score.js", () => ({
  scoreNewRows: vi.fn(async () => new Map()),
  tallyScored: vi.fn(),
}));
vi.mock("../ingest/topics.js", () => ({
  normalizeNewRowTopics: vi.fn(async () => new Map()),
  learnTopics: vi.fn(async () => {}),
}));
vi.mock("../ingest/merge.js", () => ({
  planMerges: vi.fn(async () => ({ merged: new Set() })),
}));
vi.mock("../ingest/source-health.js", () => ({
  tallySourceOutcomes: vi.fn(),
  resolveSkipReasons: vi.fn(),
  carrySourceStreaks: vi.fn(async () => {}),
}));
vi.mock("../ingest/write.js", () => ({ writeItems: vi.fn(async () => {}) }));
vi.mock("../ingest/translate.js", () => ({
  selectPublishedRows: vi.fn(() => rows),
  translatePublishedRows: vi.fn(),
}));
vi.mock("../ingest/backfill-translate.js", () => ({
  backfillTranslations: vi.fn(),
}));
vi.mock("../ingest/backfill.js", () => ({
  backfillContent: vi.fn(async () => 0),
}));
vi.mock("../ingest/backfill-en-summary.js", () => ({
  backfillEnSummaries: vi.fn(async () => ({ tokens: 0 })),
}));
vi.mock("../ingest/backfill-score.js", () => ({
  backfillScores: vi.fn(async () => ({ tokens: 0 })),
}));
vi.mock("../ingest/inbound-email.js", () => ({
  processInboundEmail: vi.fn(async () => {}),
}));
vi.mock("../ingest/reviews.js", () => ({
  qaTranslations: vi.fn(async () => ({ rated: 0, adjusted: 0, tokens: 0 })),
  reviewSuggestions: vi.fn(async () => ({ reviewed: 0, tokens: 0 })),
  reviewSubmissions: vi.fn(async () => ({ reviewed: 0, tokens: 0 })),
}));
vi.mock("../ingest/publish.js", () => ({
  generateTldr: vi.fn(async () => ({ generated: false, tokens: 0 })),
  generateWeekly: vi.fn(async () => ({ tokens: 0 })),
  sendEmailDigest: vi.fn(async () => 0),
  notifyChannels: vi.fn(async () => ({ sent: {}, reasons: {} })),
}));

import { backfillTranslations } from "../ingest/backfill-translate.js";
import { translatePublishedRows } from "../ingest/translate.js";
import type { Env } from "../types.js";
import { NewsIngestWorkflow } from "../workflow.js";

const LAGUNA = "poolside/laguna-s-2.1";
const GEMINI = "google/gemini-3-flash";

function translation(model: string, summary: string) {
  return { i: 0, title: "Tiêu đề", summary, tokens: 5, model };
}

/** Runs the Workflow and returns the `stats` of the row it closed the run
 *  with, read off the D1 upsert the way /data?tab=runs would. */
async function runWorkflow(payload?: unknown) {
  const upserts: unknown[][] = [];
  const statement = {
    bind: (...args: unknown[]) => {
      if (args.length === 7) upserts.push(args);
      return statement;
    },
    run: async () => ({ success: true }),
    first: async () => null,
    all: async () => ({ results: [] }),
  };
  const env = {
    DB: { prepare: () => statement, batch: async () => [] },
  } as unknown as Env;
  const step = {
    do: async (_name: string, ...rest: unknown[]) =>
      (rest.at(-1) as () => Promise<unknown>)(),
  };
  const workflow = new NewsIngestWorkflow({} as never, env);
  await workflow.run(
    { payload, timestamp: new Date(), instanceId: "run-1" } as never,
    step as never
  );
  const closed = upserts.at(-1);
  expect(closed?.[5]).toBeNull();
  return JSON.parse(String(closed?.[6])) as {
    viEnglish?: Record<string, { translated: number; english: number }>;
  };
}

describe("ingest Workflow stores the English-in-VI tally", () => {
  beforeEach(() => {
    vi.mocked(translatePublishedRows).mockResolvedValue(
      new Map([
        ["row-1", translation(LAGUNA, "Tóm tắt tiếng Việt.")],
        ["row-2", translation(LAGUNA, "A summary left in English.")],
        ["row-3", translation(GEMINI, "Tóm tắt khác.")],
      ])
    );
    vi.mocked(backfillTranslations).mockResolvedValue({
      translated: 0,
      tokens: 0,
      viEnglish: {},
    });
  });

  // The 24h alert reads stats.viEnglish back out of workflow_runs. If the
  // Workflow stops tallying the rows it writes, or drops the tally from the
  // run's stats, the window reads empty and the alert goes quiet for good.
  it("saves the tally of the rows a run translated, per model", async () => {
    const stats = await runWorkflow();
    expect(stats.viEnglish).toEqual({
      [LAGUNA]: { translated: 2, english: 1 },
      [GEMINI]: { translated: 1, english: 0 },
    });
  });

  it("adds the rows backfill-translate wrote to the run's tally", async () => {
    vi.mocked(backfillTranslations).mockResolvedValue({
      translated: 1,
      tokens: 4,
      viEnglish: { [LAGUNA]: { translated: 1, english: 1 } },
    });
    const stats = await runWorkflow();
    expect(stats.viEnglish?.[LAGUNA]).toEqual({ translated: 3, english: 2 });
  });
});
