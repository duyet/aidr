import type { WorkflowStep } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A dry run exists so a local agent can exercise production without anyone
 * receiving an email or a Telegram post. These tests fail if any send path
 * is reached in dry-run mode, if the live TL;DR edition is overwritten, or
 * if a partial run silently runs steps it was not asked for.
 */

vi.mock("../subscribe/send.js", async (original) => ({
  ...(await original<typeof import("../subscribe/send.js")>()),
  sendDailyTldr: vi.fn(async () => 3),
}));
vi.mock("../notify/index.js", async (original) => ({
  ...(await original<typeof import("../notify/index.js")>()),
  dispatchStoryNotifications: vi.fn(async () => ({
    sent: { telegram: 1 },
    reasons: {},
  })),
}));
vi.mock("../owner-alerts.js", async (original) => ({
  ...(await original<typeof import("../owner-alerts.js")>()),
  notifyOwner: vi.fn(async () => undefined),
  sendOwnerDm: vi.fn(async () => true),
}));
vi.mock("../bugsink.js", async (original) => ({
  ...(await original<typeof import("../bugsink.js")>()),
  reportHealthAlert: vi.fn(async () => undefined),
}));
vi.mock("../llm.js", async (original) => ({
  ...(await original<typeof import("../llm.js")>()),
  generateTldr: vi.fn(async (_env: unknown, items: { id: string }[]) => ({
    bullets_en: items.map((item) => ({
      text: `EN ${item.id}`,
      item_ids: [item.id],
    })),
    bullets_vi: items.map((item) => ({
      text: `VI ${item.id}`,
      item_ids: [item.id],
    })),
    tokens: 42,
  })),
}));

const { previewRanking, previewTldr, triggerIngest } = await import(
  "../admin/handlers.js"
);
const { runHealthCheck } = await import("../health.js");
const { generateTldr, notifyChannels, sendEmailDigest } = await import(
  "../ingest/publish.js"
);
const {
  DRY_RUN_SKIP_REASON,
  ingestModeFromPayload,
  LIVE_FULL_RUN,
  NOT_SELECTED_REASON,
  runChainStep,
  skipUnselectedStep,
  validateIngestMode,
} = await import("../ingest/mode.js");
const { buildRunStats, serializeRunStats } = await import("../run-stats.js");
const { sendDailyTldr } = await import("../subscribe/send.js");
const { dispatchStoryNotifications } = await import("../notify/index.js");
const { notifyOwner, sendOwnerDm } = await import("../owner-alerts.js");
const { reportHealthAlert } = await import("../bugsink.js");

import type { IngestContext } from "../ingest/context.js";
import type { IngestMode } from "../ingest/mode.js";
import type { RunStepInfo } from "../run-stats.js";
import type { Env } from "../types.js";

const NOW_SEC = Math.floor(Date.now() / 1000);

const ITEMS = [
  {
    id: "a",
    title: "Alpha",
    summary: "alpha summary",
    title_vi: "Alpha vi",
    source_id: "hn",
    published_at: NOW_SEC - 600,
    points: 120,
    comments: 30,
    llm_relevance: 0.9,
    llm_importance: 8,
    llm_quality: 7,
    rank_score: 12,
    source_count: 2,
  },
  {
    id: "b",
    title: "Beta",
    summary: null,
    title_vi: null,
    source_id: "lobsters",
    published_at: NOW_SEC - 3600,
    points: 10,
    comments: 2,
    llm_relevance: 0.7,
    llm_importance: 6,
    llm_quality: 6,
    rank_score: 5,
    source_count: 1,
  },
];

/** Records every statement that is executed with `.run()` (a write) and
 * answers the handful of SELECTs these paths issue. */
class RecordingD1 {
  writes: string[] = [];
  /** What the create-path lastRun verify reads back. */
  lastRunId: string | null = null;

  prepare(sql: string) {
    const answer = (): unknown[] => {
      if (/FROM items/.test(sql)) return ITEMS;
      if (/SELECT id FROM workflow_runs/.test(sql) && this.lastRunId) {
        return [{ id: this.lastRunId }];
      }
      return [];
    };
    const bound = {
      all: async () => ({ results: answer() }),
      first: async () => null,
      run: async () => {
        this.writes.push(sql);
        return { success: true, meta: { changes: 1 } };
      },
    };
    return { ...bound, bind: (..._args: unknown[]) => bound };
  }
}

function makeEnv(db = new RecordingD1()): Env {
  return {
    DB: db as unknown as D1Database,
    NEWS_INGEST: { create: vi.fn(async () => ({})) } as unknown as Workflow,
    TELEGRAM_OWNER_CHAT_ID: "owner",
  } as unknown as Env;
}

/** Runs `step.do` callbacks inline, the way a first (non-replay) Workflow
 * execution does. */
const inlineStep = {
  do: async (_name: string, a: unknown, b?: unknown) =>
    (typeof a === "function" ? a : (b as () => unknown))(),
} as unknown as WorkflowStep;

function makeCtx(mode: IngestMode, env = makeEnv()): IngestContext {
  return { step: inlineStep, env, runId: "run-1", steps: [], mode };
}

const DRY: IngestMode = { dryRun: true, steps: null };

function tldrWrites(db: RecordingD1): string[] {
  return db.writes.filter((sql) => /tldr_snapshots/.test(sql));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("dry run never distributes", () => {
  it("records email as skipped without calling the digest sender", async () => {
    const ctx = makeCtx(DRY);
    expect(await sendEmailDigest(ctx)).toBe(0);
    expect(sendDailyTldr).not.toHaveBeenCalled();
    expect(ctx.steps).toEqual([
      { name: "email", action: "skipped", reason: DRY_RUN_SKIP_REASON },
    ]);
  });

  it("records notify as skipped without dispatching Telegram", async () => {
    const ctx = makeCtx(DRY);
    expect(await notifyChannels(ctx)).toEqual({ sent: {}, reasons: {} });
    expect(dispatchStoryNotifications).not.toHaveBeenCalled();
    expect(ctx.steps).toEqual([
      { name: "notify", action: "skipped", reason: DRY_RUN_SKIP_REASON },
    ]);
  });

  it("still sends on a live run, so the gate above is what stops it", async () => {
    const ctx = makeCtx(LIVE_FULL_RUN);
    expect(await sendEmailDigest(ctx)).toBe(3);
    await notifyChannels(ctx);
    expect(sendDailyTldr).toHaveBeenCalledTimes(1);
    expect(dispatchStoryNotifications).toHaveBeenCalledTimes(1);
  });

  it("previews the TL;DR without touching the live tldr_snapshots row", async () => {
    const db = new RecordingD1();
    const ctx = makeCtx(DRY, makeEnv(db));
    const result = await generateTldr(ctx);
    expect(tldrWrites(db)).toEqual([]);
    // A preview is never counted as a generated edition.
    expect(result.generated).toBe(false);
    // The preview is the edition a live run would persist, fallbacks
    // included: the mocked "VI" bullets read as English, so VI falls back to
    // title_vi || title exactly as ensureDailyTldr would.
    expect(result.preview).toEqual({
      bullets: 2,
      en: ["EN a", "EN b"],
      vi: ["Alpha vi", "Beta"],
    });
    expect(ctx.steps[0]?.name).toBe("tldr");
    expect(ctx.steps[0]?.action).toBe("preview: 2 bullets");
  });

  it("writes the edition on a live run (the path the preview must avoid)", async () => {
    const db = new RecordingD1();
    await generateTldr(makeCtx(LIVE_FULL_RUN, makeEnv(db)));
    expect(tldrWrites(db)).toHaveLength(1);
  });

  // A failed step always raises `step-failed`, whatever the hour.
  const failingSteps: RunStepInfo[] = [
    { name: "fetch", action: "failed", reason: "boom" },
    { name: "notify", action: "skipped", reason: DRY_RUN_SKIP_REASON },
  ];

  it("raises no owner alert, Bugsink alert or daily summary", async () => {
    const keys = await runHealthCheck(makeEnv(), {
      runId: "run-1",
      steps: failingSteps,
      dryRun: true,
    });
    expect(keys).toEqual([]);
    expect(reportHealthAlert).not.toHaveBeenCalled();
    expect(notifyOwner).not.toHaveBeenCalled();
    expect(sendOwnerDm).not.toHaveBeenCalled();
  });

  it("alerts on the same steps in a live run, so the dry-run gate is what stops it", async () => {
    const keys = await runHealthCheck(makeEnv(), {
      runId: "run-1",
      steps: failingSteps,
    });
    expect(keys).toContain("step-failed");
    expect(reportHealthAlert).toHaveBeenCalled();
    expect(notifyOwner).toHaveBeenCalled();
  });

  it("keeps the dry-run marker and preview through stats sanitizing", () => {
    const stats = JSON.parse(
      serializeRunStats(
        buildRunStats({
          mode: "dry-run",
          selectedSteps: ["tldr"],
          tldrPreview: { bullets: 2, en: ["EN a"], vi: ["VI a"] },
        })
      )
    );
    expect(stats.mode).toBe("dry-run");
    expect(stats.selectedSteps).toEqual(["tldr"]);
    expect(stats.tldrPreview).toEqual({
      bullets: 2,
      en: ["EN a"],
      vi: ["VI a"],
    });
    // The history readers exclude dry runs with this exact substring.
    expect(serializeRunStats(buildRunStats({ mode: "dry-run" }))).toContain(
      '"mode":"dry-run"'
    );
  });
});

describe("step selection", () => {
  it("records every unselected step as not selected and runs only the chosen one", () => {
    const ctx = makeCtx({ dryRun: false, steps: ["tldr"] });
    const ran: string[] = [];
    if (runChainStep(ctx, "fetch")) ran.push("fetch");
    for (const name of ["backfill-content", "tldr", "email", "notify"] as const)
      if (!skipUnselectedStep(ctx, name)) ran.push(name);
    expect(ran).toEqual(["tldr"]);
    expect(ctx.steps.map((s) => `${s.name}:${s.reason}`)).toEqual([
      `fetch:${NOT_SELECTED_REASON}`,
      `dedupe:${NOT_SELECTED_REASON}`,
      `score:${NOT_SELECTED_REASON}`,
      `translate:${NOT_SELECTED_REASON}`,
      `write:${NOT_SELECTED_REASON}`,
      `backfill-content:${NOT_SELECTED_REASON}`,
      `email:${NOT_SELECTED_REASON}`,
      `notify:${NOT_SELECTED_REASON}`,
    ]);
  });

  it("never scores or writes rows whose upstream step was skipped", () => {
    // Selecting score without fetch would write unscored or empty rows.
    const ctx = makeCtx({ dryRun: true, steps: ["score", "write"] });
    expect(runChainStep(ctx, "fetch")).toBe(false);
    expect(ctx.steps.find((s) => s.name === "score")?.reason).toBe(
      "needs fetch, dedupe"
    );
    expect(ctx.steps.find((s) => s.name === "write")?.reason).toBe(
      "needs fetch, dedupe, translate"
    );
  });

  it("drops unknown step names from a Workflow payload instead of failing the run", () => {
    expect(
      ingestModeFromPayload({ dryRun: true, steps: ["tldr", "bogus"] })
    ).toEqual({ dryRun: true, steps: ["tldr"] });
    expect(ingestModeFromPayload(undefined)).toEqual(LIVE_FULL_RUN);
  });
});

describe("trigger validation", () => {
  it("rejects unknown steps so a typo never becomes a full live run", async () => {
    const env = makeEnv();
    const result = await triggerIngest(env, { steps: ["tldr", "emial"] });
    expect(result).toMatchObject({ status: 400 });
    expect(String((result as { error: string }).error)).toContain("emial");
    expect(env.NEWS_INGEST.create).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean dryRun rather than guessing", () => {
    expect(validateIngestMode({ dryRun: "yes" }).ok).toBe(false);
    expect(validateIngestMode({ steps: [] }).ok).toBe(false);
  });

  it("passes the dry-run payload to the Workflow and keeps steps in pipeline order", async () => {
    const env = makeEnv();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001"
    );
    // The verified persist reads lastRun back; answer with this id.
    (env.DB as unknown as RecordingD1).lastRunId =
      "00000000-0000-4000-8000-000000000001";
    const result = await triggerIngest(env, {
      dryRun: true,
      steps: ["notify", "tldr"],
    });
    expect(result).toMatchObject({ skipped: false, dryRun: true });
    expect(env.NEWS_INGEST.create).toHaveBeenCalledWith({
      id: "00000000-0000-4000-8000-000000000001",
      params: { dryRun: true, steps: ["tldr", "notify"] },
    });
  });
});

describe("read-only previews", () => {
  it("preview_ranking reads the ranked window and writes nothing", async () => {
    const db = new RecordingD1();
    const result = await previewRanking(makeEnv(db), "5");
    expect(db.writes).toEqual([]);
    expect(result.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.items[0]?.inputs).toMatchObject({
      importance: 8,
      quality: 7,
      source_count: 2,
    });
    expect(result.items[0]?.rank_score_now).toBeGreaterThan(0);
  });

  it("preview_tldr returns bullets and writes neither the edition nor items", async () => {
    const db = new RecordingD1();
    const result = await previewTldr(makeEnv(db));
    expect(result.bullets_en).toHaveLength(2);
    expect(result.bullets_vi).toHaveLength(2);
    expect(result.operationId).toMatch(/^tldr-preview-/);
    // llm_calls rows are expected (observability); nothing else may change.
    expect(
      db.writes.filter((sql) => !/INSERT INTO llm_calls/.test(sql))
    ).toEqual([]);
  });
});

describe("dry runs and the hourly schedule", () => {
  it("never marks a dry run as the last started run", async () => {
    const { tickIngest } = await import("../ingest-schedule.js");
    const id = "00000000-0000-4000-8000-000000000002";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(id);
    const canStart = vi.fn(async () => ({ id: null, skipped: false }));
    const markStarted = vi.fn(async () => undefined);
    const db = new RecordingD1();
    db.lastRunId = id;
    const env = {
      DB: db,
      NEWS_INGEST: { create: vi.fn(async () => ({})) },
      NEWS_INGEST_SCHEDULER: {
        idFromName: () => "default",
        get: () => ({ canStart, markStarted }),
      },
    } as unknown as Parameters<typeof tickIngest>[0];

    await tickIngest(env, { mode: { dryRun: true, steps: null } });
    // Otherwise the next real hourly run would be skipped as "ran recently"
    // and the alarm pushed back an hour.
    expect(canStart).toHaveBeenCalledWith({
      force: undefined,
      scheduled: false,
    });
    expect(markStarted).not.toHaveBeenCalled();

    await tickIngest(env, {});
    expect(markStarted).toHaveBeenCalledWith(id);
  });
});
