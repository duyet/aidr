import type { WorkflowStep } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The weekly edition picks the week's best stories once the week closes and
 * writes one bilingual row. These tests fail if ranking favours late-week
 * stories just because stored rank_score decays, if English ever lands in
 * the Vietnamese column, if the step does LLM work outside its Monday
 * window, or if a dry run writes the live table.
 */

/** `value` answers every call; `queue` (when set) answers calls in order. */
const llmContent = vi.hoisted(() => ({
  value: "" as string | Error,
  queue: [] as (string | Error)[],
  calls: 0,
}));

vi.mock("../llm.js", async (original) => ({
  ...(await original<typeof import("../llm.js")>()),
  callAnyrouter: vi.fn(async () => {
    llmContent.calls++;
    const next = llmContent.queue.shift() ?? llmContent.value;
    if (next instanceof Error) throw next;
    return { content: next, tokens: 77 };
  }),
}));
vi.mock("../translation-knowledge.js", async (original) => ({
  ...(await original<typeof import("../translation-knowledge.js")>()),
  viSystemPrompt: vi.fn(async (_env: unknown, base: string) => base),
}));

const {
  composeWeeklyEdition,
  editionHits,
  ensureWeeklyEdition,
  loadWeeklyCandidates,
  rankWeeklyCandidates,
  sanitizeWeeklyOutput,
  weeklyGateReason,
  weeklyScore,
  WEEKLY_RETRY_MS,
} = await import("../weekly.js");
const { STORY_KIND_WEIGHTS } = await import("../ranking.js");
const { generateWeekly } = await import("../ingest/publish.js");
const { evaluateHealth } = await import("../health.js");

import type { IngestContext } from "../ingest/context.js";
import type { Env } from "../types.js";
import type { WeeklyCandidate } from "../weekly.js";

// Monday 10:00 in Ho Chi Minh City: W41 (Oct 5–11) has just closed.
const MONDAY = Date.parse("2026-10-12T03:00:00Z");

function candidate(over: Partial<WeeklyCandidate>): WeeklyCandidate {
  return {
    id: "x",
    source_id: "hn",
    title: "Title",
    title_vi: null,
    summary: null,
    category: null,
    importance: 5,
    quality: 5,
    points: 0,
    comments: 0,
    vote_net: 0,
    editionDays: 0,
    bestPosition: null,
    ...over,
  };
}

describe("weekly ranking", () => {
  it("ranks a strong Monday story above a weaker Sunday one (no age decay)", () => {
    // Stored rank_score would favour Sunday: it decays 36h and freezes at
    // 72h, so a Monday-built edition would be all weekend news. The weekly
    // score ignores age and uses importance, quality and engagement.
    const monday = candidate({ id: "mon", importance: 9, quality: 8 });
    const sunday = candidate({
      id: "sun",
      source_id: "techcrunch-ai",
      importance: 6,
      quality: 6,
    });
    expect(rankWeeklyCandidates([sunday, monday]).map((c) => c.id)).toEqual([
      "mon",
      "sun",
    ]);
  });

  it("rewards days in the daily editions and reader votes", () => {
    const quiet = candidate({ id: "quiet", importance: 7 });
    const featured = candidate({
      id: "featured",
      source_id: "lobsters",
      importance: 7,
      editionDays: 2,
      bestPosition: 0,
    });
    const voted = candidate({
      id: "voted",
      source_id: "reddit-ml",
      importance: 7,
      vote_net: 4,
    });
    // Four votes are x1.8 (READER_VOTE_GAIN 0.2 each), more than two edition
    // days with a top slot (1.5 x 1.15): the owner wants votes to lead.
    expect(
      rankWeeklyCandidates([quiet, voted, featured]).map((c) => c.id)
    ).toEqual(["voted", "featured", "quiet"]);
  });

  it("counts a merged duplicate's edition days toward its canonical story", () => {
    const hits = editionHits(
      [
        {
          date: "2026-10-05",
          bullets_en: JSON.stringify([{ text: "a", item_ids: ["dup"] }]),
        },
        {
          date: "2026-10-06",
          bullets_en: JSON.stringify([
            { text: "b", item_ids: ["other"] },
            { text: "c", item_ids: ["canon"] },
          ]),
        },
      ],
      new Map([["dup", "canon"]])
    );
    expect(hits.get("canon")).toEqual({ days: 2, best: 0 });
    expect(hits.has("dup")).toBe(false);
  });
});

describe("weekly copy keeps languages apart", () => {
  const ids = new Set(["a", "b"]);

  it("drops Vietnamese lines that are English echoes", () => {
    const out = sanitizeWeeklyOutput(
      {
        intro_en: "A big week.",
        intro_vi: "A big week.",
        stories: [
          { id: "a", en: "Alpha shipped.", vi: "Alpha ra mắt mô hình mới." },
          { id: "b", en: "Beta raised.", vi: "Beta raised." },
          { id: "zzz", en: "Invented", vi: "Bịa đặt" },
        ],
      },
      ids
    );
    expect(out.intro_vi).toBeNull();
    expect(out.vi.get("a")).toBe("Alpha ra mắt mô hình mới.");
    expect(out.vi.has("b")).toBe(false);
    expect(out.en.has("zzz")).toBe(false);
  });

  it("falls back to title_vi only, and leaves a story out of VI rather than print English", () => {
    const rows = [
      candidate({ id: "a", title: "Alpha", title_vi: "Alpha tiếng Việt" }),
      candidate({ id: "b", title: "Beta", title_vi: null }),
    ];
    const edition = composeWeeklyEdition("2026-W41", rows, null);
    expect(edition?.stories_en.map((s) => s.text)).toEqual(["Alpha", "Beta"]);
    expect(edition?.stories_vi).toEqual([
      { item_id: "a", text: "Alpha tiếng Việt" },
    ]);
    expect(edition?.intro_vi).toBeNull();
    // No model copy: marked so a later run upgrades it.
    expect(edition?.fallback).toBe(true);
    expect(edition?.issue).toBe(2);
    expect(edition?.start_date).toBe("2026-10-05");
  });
});

describe("weekly gate", () => {
  const complete = {
    fallback: 0,
    intro_vi: "Tuần lớn.",
    stories_vi: '[{"item_id":"a","text":"x"}]',
    updated_at: MONDAY,
  };

  it("builds a missing week and never rebuilds a complete one", () => {
    expect(
      weeklyGateReason({ issue: 2, existing: null, nowMs: MONDAY })
    ).toBeNull();
    expect(
      weeklyGateReason({
        issue: 2,
        existing: complete,
        nowMs: MONDAY + 7 * 86_400_000,
      })
    ).toBe("edition already written");
  });

  it("retries a fallback or English-only row, but not every 30-minute run", () => {
    const fallback = { ...complete, fallback: 1 };
    expect(
      weeklyGateReason({ issue: 2, existing: fallback, nowMs: MONDAY + 1000 })
    ).toBe("incomplete edition retried recently");
    expect(
      weeklyGateReason({
        issue: 2,
        existing: { ...complete, intro_vi: null },
        nowMs: MONDAY + WEEKLY_RETRY_MS,
      })
    ).toBeNull();
  });

  it("does nothing before the first issue", () => {
    expect(weeklyGateReason({ issue: null, existing: null, nowMs: 0 })).toBe(
      "before the first weekly issue"
    );
  });
});

/** Answers the weekly step's SELECTs and records every `.run()` write. */
class WeeklyD1 {
  writes: { sql: string; args: unknown[] }[] = [];
  reads: string[] = [];
  constructor(private existing: Record<string, unknown>[] = []) {}

  prepare(sql: string) {
    this.reads.push(sql);
    let args: unknown[] = [];
    const answer = (): unknown[] => {
      if (/FROM tldr_snapshots/.test(sql)) {
        return [
          {
            date: "2026-10-06",
            bullets_en: JSON.stringify([{ text: "a", item_ids: ["a"] }]),
          },
        ];
      }
      if (/FROM weekly_snapshots/.test(sql)) return this.existing;
      if (/SELECT id, duplicate_of/.test(sql)) return [];
      if (/FROM items i/.test(sql)) {
        return [
          {
            id: "a",
            source_id: "hn",
            title: "Alpha",
            title_vi: "Alpha tiếng Việt",
            summary: "alpha",
            category: "Models",
            llm_importance: 8,
            llm_quality: 7,
            points: 10,
            comments: 1,
            vote_net: 0,
          },
        ];
      }
      return [];
    };
    const bound = {
      all: async () => ({ results: answer() }),
      first: async () => null,
      run: async () => {
        this.writes.push({ sql, args });
        return { success: true, meta: { changes: 1 } };
      },
    };
    return {
      ...bound,
      bind: (...a: unknown[]) => {
        args = a;
        return bound;
      },
    };
  }
}

const inlineStep = {
  do: async (_name: string, a: unknown, b?: unknown) =>
    (typeof a === "function" ? a : (b as () => unknown))(),
} as unknown as WorkflowStep;

function env(db: WeeklyD1): Env {
  return { DB: db as unknown as D1Database } as unknown as Env;
}

const GOOD_COPY = JSON.stringify({
  intro_en: "Alpha defined the week.",
  intro_vi: "Alpha là tâm điểm của tuần.",
  stories: [
    { id: "a", en: "Alpha shipped a model.", vi: "Alpha ra mắt mô hình." },
  ],
});

/** A complete row: LLM copy in both languages. */
function completeRow(week: string) {
  return {
    week,
    fallback: 0,
    intro_vi: "x",
    stories_vi: '[{"item_id":"a","text":"y"}]',
    updated_at: MONDAY - 1000,
    created_at: MONDAY - 1000,
  };
}

describe("weekly step", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MONDAY);
    llmContent.value = GOOD_COPY;
    llmContent.queue = [];
    llmContent.calls = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes last week's edition once, with each language in its own column", async () => {
    const db = new WeeklyD1([completeRow("2026-W40")]);
    const stats = await ensureWeeklyEdition(env(db), MONDAY);
    expect(stats).toMatchObject({ generated: true, week: "2026-W41" });
    expect(db.writes).toHaveLength(1);
    const args = db.writes[0].args;
    expect(args[0]).toBe("2026-W41");
    expect(args[1]).toBe(2);
    expect(args[5]).toBe("Alpha defined the week.");
    expect(args[6]).toBe("Alpha là tâm điểm của tuần.");
    expect(JSON.parse(args[8] as string)).toEqual([
      { item_id: "a", text: "Alpha ra mắt mô hình." },
    ]);
    expect(args[9]).toBe(0);
  });

  it("recovers an older missing week first, so a late deploy or a failed Monday never skips an issue", async () => {
    const db = new WeeklyD1();
    const stats = await ensureWeeklyEdition(env(db), MONDAY);
    expect(stats).toMatchObject({ generated: true, week: "2026-W40" });
    expect(db.writes[0].args.slice(0, 2)).toEqual(["2026-W40", 1]);
    // One edition (one LLM call) per run; the next run writes W41.
    expect(db.writes).toHaveLength(1);
  });

  it("is one cheap read and no LLM call when every week is already written", async () => {
    const db = new WeeklyD1([completeRow("2026-W40"), completeRow("2026-W41")]);
    const stats = await ensureWeeklyEdition(env(db), MONDAY);
    expect(stats.generated).toBe(false);
    expect(db.reads).toHaveLength(1);
    expect(db.writes).toEqual([]);
  });

  it("never replaces a real edition with title lines when a retry's LLM fails", async () => {
    llmContent.value = new Error("chain exhausted");
    const db = new WeeklyD1([
      completeRow("2026-W40"),
      {
        ...completeRow("2026-W41"),
        intro_vi: null,
        stories_vi: "[]",
        updated_at: MONDAY - WEEKLY_RETRY_MS,
      },
    ]);
    const stats = await ensureWeeklyEdition(env(db), MONDAY);
    expect(stats.reason).toMatch(/^kept existing edition/);
    // Only the retry clock moves; the edition itself is untouched.
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].sql).toMatch(/^UPDATE weekly_snapshots SET updated_at/);
    expect(db.writes[0].args).toEqual([MONDAY, "2026-W41"]);
  });

  /** Health issues for a run whose only step is the recorded weekly one. */
  function healthKeys(ctx: IngestContext) {
    return evaluateHealth({
      nowMs: MONDAY,
      localHour: 10,
      steps: ctx.steps,
      telegramLastPostMs: {},
      llm: { total: 0, failed: 0, rateLimited: 0, tasks: [] },
      history: [],
    }).map((i) => i.key);
  }

  function liveCtx(db: WeeklyD1): IngestContext {
    return {
      step: inlineStep,
      env: env(db),
      runId: "run-1",
      steps: [],
      mode: { dryRun: false, steps: ["weekly"] },
    };
  }

  // 2026-W40 (#567): the first hop streamed no token, the other id was down.
  // The step must store title lines (fallback = 1, retried by the gate),
  // warn instead of error, and not raise a "step-failed" health alert.
  it("stores the title fallback and stays quiet when the model chain is exhausted", async () => {
    llmContent.value = new Error(
      "anyrouter chain exhausted: openai/gpt-5.6-luna: anyrouter request timed out"
    );
    const db = new WeeklyD1([completeRow("2026-W40")]);
    const ctx = liveCtx(db);
    const result = await generateWeekly(ctx);
    expect(result.generated).toBe(true);
    // The failed call reports 0 tokens; the rolling digest must still wait.
    expect(result.tokens).toBe(0);
    expect(ctx.steps[0].reason).not.toMatch(/digest/);
    expect(db.writes).toHaveLength(1);
    const args = db.writes[0].args;
    expect(args[0]).toBe("2026-W41");
    expect(args[5]).toBeNull();
    expect(JSON.parse(args[7] as string)).toEqual([
      { item_id: "a", text: "Alpha" },
    ]);
    expect(args[9]).toBe(1);
    // Two passes over the chain before giving up.
    expect(llmContent.calls).toBe(2);
    expect(ctx.steps[0].reason).toMatch(/title fallback/);
    expect(healthKeys(ctx)).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("a second pass over the chain recovers from a first-pass timeout", async () => {
    llmContent.queue = [
      new Error("anyrouter chain exhausted: m: anyrouter request timed out"),
    ];
    const db = new WeeklyD1([completeRow("2026-W40")]);
    const stats = await ensureWeeklyEdition(env(db), MONDAY);
    expect(stats.generated).toBe(true);
    expect(stats.llmCalled).toBe(true);
    expect(llmContent.calls).toBe(2);
    expect(db.writes[0].args[9]).toBe(0);
  });

  // A bug is not a provider outage: one pass, logged as an error, and the
  // step still trips the health alert.
  it("still flags the step when the copy fails for a non-provider reason", async () => {
    llmContent.value = new TypeError("cannot read properties of undefined");
    const db = new WeeklyD1([completeRow("2026-W40")]);
    const ctx = liveCtx(db);
    await generateWeekly(ctx);
    expect(llmContent.calls).toBe(1);
    expect(db.writes[0].args[9]).toBe(1);
    expect(healthKeys(ctx)).toEqual(["step-failed"]);
    expect(console.error).toHaveBeenCalled();
  });

  it("a dry run previews the edition and writes nothing", async () => {
    const db = new WeeklyD1();
    const ctx: IngestContext = {
      step: inlineStep,
      env: env(db),
      runId: "run-1",
      steps: [],
      mode: { dryRun: true, steps: ["weekly"] },
    };
    const result = await generateWeekly(ctx);
    expect(db.writes.filter((w) => /weekly_snapshots/.test(w.sql))).toEqual([]);
    expect(result.generated).toBe(false);
    expect(result.preview).toMatchObject({
      week: "2026-W41",
      stories: 1,
      vi: ["Alpha ra mắt mô hình."],
    });
    expect(ctx.steps[0]).toMatchObject({
      name: "weekly",
      action: "preview: 1 stories",
    });
  });
});

describe("loadWeeklyCandidates engagement", () => {
  function db(rows: Record<string, unknown>[]) {
    const reads: { sql: string; args: unknown[] }[] = [];
    return {
      reads,
      prepare(sql: string) {
        let args: unknown[] = [];
        const bound = {
          all: async () => ({
            results: /FROM tldr_snapshots/.test(sql)
              ? [
                  {
                    date: "2026-10-06",
                    bullets_en: JSON.stringify([
                      { text: "a", item_ids: ["agg"] },
                    ]),
                  },
                ]
              : /FROM items i/.test(sql)
                ? rows
                : [],
          }),
          first: async () => null,
        };
        return {
          ...bound,
          bind: (...a: unknown[]) => {
            args = a;
            reads.push({ sql, args });
            return bound;
          },
        };
      },
    };
  }
  const base = {
    title: "t",
    title_vi: null,
    summary: null,
    category: null,
    llm_importance: 7,
    llm_quality: 7,
    vote_net: 0,
    signal_url: null,
  };

  it("ranks reader engagement only: aggregator author/tweet counts are dropped", async () => {
    const d = db([
      {
        ...base,
        id: "agg",
        source_id: "marketbrief",
        points: 40,
        comments: 300,
        merged_members: JSON.stringify([["hn", 120, 30, null]]),
      },
    ]);
    const [c] = await loadWeeklyCandidates(
      { DB: d as unknown as D1Database },
      "2026-W41"
    );
    // The HN copy merged into it supplies the reader signal.
    expect(c?.points).toBe(120);
    expect(c?.comments).toBe(30);
  });

  it("carries the stored category into the weekly score's kind weight", async () => {
    // Dropping category on load or in weeklyScore would score every weekly
    // story flat while the daily ranking weighs it.
    const d = db([
      {
        ...base,
        category: "Models",
        id: "release",
        source_id: "hn",
        points: 50,
        comments: 10,
        merged_members: "[]",
      },
    ]);
    const [c] = await loadWeeklyCandidates(
      { DB: d as unknown as D1Database },
      "2026-W41"
    );
    if (!c) throw new Error("expected one candidate");
    expect(weeklyScore(c) / weeklyScore({ ...c, category: null })).toBeCloseTo(
      STORY_KIND_WEIGHTS.Models,
      10
    );
  });

  it("bounds cited stories to the week", async () => {
    const d = db([]);
    await loadWeeklyCandidates({ DB: d as unknown as D1Database }, "2026-W41");
    const cited = d.reads.find(
      (r) => /json_each/.test(r.sql) && /FROM items i/.test(r.sql)
    );
    expect(cited?.sql).toContain("i.published_at >= ?");
    expect(cited?.args).toHaveLength(3);
  });
});
