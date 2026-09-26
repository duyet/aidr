import { describe, expect, it } from "vitest";
import type { LlmCallRow, WorkflowRunStats } from "../../lib/system-queries";
import {
  bySourceSubline,
  extraBadges,
  fallbackTransitions,
  formatDuration,
  formatDurationSec,
  formatMs,
  formatSafeDetail,
  formatSafeError,
  formatScore,
  formatSecondsShort,
  formatTimestamp,
  formatTokenValue,
  hasRunDetails,
  isPreIdentityRun,
  llmTokens,
  nextOpenId,
  normalizeRunTokens,
  runAxisHeading,
  runAxisTime,
  runDetailsId,
  runDisclosureLabel,
  runFallbackKindLabel,
  runStatus,
  safeRunSteps,
  shortModel,
  statusVariant,
  stepFallbackNotes,
  tokenBreakdown,
} from "./run-format";

/**
 * Display helpers shared by the system dashboard run rows. They matter
 * because a run row is an at-a-glance health signal: missing data must
 * render as an em-dash (never "0s" masquerading as a real duration),
 * model ids must stay short, and badges/variants must only fire on real
 * signal.
 */

describe("formatDurationSec / formatDuration", () => {
  it("treats missing endpoints as unknown, not zero-duration", () => {
    expect(formatDurationSec(null, 100)).toBe(0);
    expect(formatDurationSec(100, null)).toBe(0);
    expect(formatDuration(null, 100)).toBe("—");
    expect(formatDuration(0, 0)).toBe("—");
  });

  it("clamps clock skew instead of showing a negative duration", () => {
    expect(formatDurationSec(200, 100)).toBe(0);
    expect(formatDuration(200, 100)).toBe("—");
  });

  it("renders seconds under a minute, rounded minutes above", () => {
    expect(formatDuration(100, 145)).toBe("45s");
    expect(formatDuration(100, 160)).toBe("1m");
    expect(formatDuration(100, 250)).toBe("3m");
  });
});

describe("formatMs", () => {
  it("uses an em-dash when there is no measurement", () => {
    expect(formatMs(0)).toBe("—");
  });

  it("picks the unit that keeps the number readable", () => {
    expect(formatMs(350)).toBe("350ms");
    expect(formatMs(1_500)).toBe("1.5s");
    expect(formatMs(12_000)).toBe("12s");
    expect(formatMs(90_000)).toBe("2m");
  });
});

describe("shortModel", () => {
  it("strips provider prefixes so fallback chains stay readable", () => {
    expect(shortModel("anyrouter/auto")).toBe("auto");
    expect(shortModel("google/gemma-4-26b-a4b-it")).toBe("gemma-4-26b-a4b-it");
    expect(shortModel("typesafe/jev")).toBe("jev");
  });

  it("passes through ids without a provider prefix", () => {
    expect(shortModel("gpt-test")).toBe("gpt-test");
  });
});

describe("bySourceSubline", () => {
  it("returns null when a run recorded no per-source pulls", () => {
    expect(bySourceSubline({})).toBeNull();
    expect(bySourceSubline({ bySource: {} })).toBeNull();
    expect(bySourceSubline({ bySource: { hn: 0 } })).toBeNull();
  });

  it("joins only the sources that actually pulled", () => {
    expect(bySourceSubline({ bySource: { hn: 3, lobsters: 0, blog: 2 } })).toBe(
      "hn 3 · blog 2"
    );
  });
});

describe("extraBadges", () => {
  it("only surfaces counters with real signal, in declared order", () => {
    const badges = extraBadges(
      {
        qaRated: 0,
        suggestionsReviewed: 2,
        backfilledSummaries: 4,
        submissionsReviewed: 1,
      },
      "en"
    );
    expect(badges).toEqual([
      { label: "backfill sum", value: 4 },
      { label: "suggestions", value: 2 },
      { label: "submissions", value: 1 },
    ]);
  });

  it("localizes labels for vi", () => {
    const badges = extraBadges({ qaAdjusted: 3 }, "vi");
    expect(badges).toEqual([{ label: "QA sửa", value: 3 }]);
  });

  it("flags runs that generated the TL;DR digest", () => {
    expect(extraBadges({ tldrGenerated: 1 }, "en")).toEqual([
      { label: "AI;DR", value: 1 },
    ]);
  });
});

describe("statusVariant", () => {
  it("makes failures loud and partial runs visibly distinct", () => {
    expect(statusVariant(false, false)).toBe("destructive");
    expect(statusVariant(true, true)).toBe("outline");
    expect(statusVariant(true, false)).toBe("secondary");
  });
});

describe("llmTokens", () => {
  it("prefers attributed llm_calls over the run's stats blob", () => {
    const llm = {
      calls: 1,
      failures: 0,
      tokens: 500,
      cachedTokens: 0,
      durationMs: 0,
      models: [],
      attempts: [],
    };
    expect(llmTokens({ tokens: 120 }, llm)).toBe(500);
  });

  it("falls back to stats.tokens when attribution has nothing", () => {
    expect(llmTokens({ tokens: 120 })).toBe(120);
    expect(
      llmTokens(
        { tokens: 120 },
        {
          calls: 0,
          failures: 0,
          tokens: 0,
          cachedTokens: 0,
          durationMs: 0,
          models: [],
          attempts: [],
        }
      )
    ).toBe(120);
    expect(llmTokens(null)).toBe(0);
  });
});

describe("run disclosure helpers", () => {
  it("toggles one run at a time and creates safe panel ids", () => {
    expect(nextOpenId(null, "run-1")).toBe("run-1");
    expect(nextOpenId("run-1", "run-1")).toBeNull();
    expect(nextOpenId("run-1", "run-2")).toBe("run-2");
    expect(runDetailsId("wf/a b")).toBe("run-details-wf-a-b");
  });

  it("localizes the accessible disclosure label", () => {
    expect(runDisclosureLabel("en", false)).toBe("Show run details");
    expect(runDisclosureLabel("en", true)).toBe("Hide run details");
    expect(runDisclosureLabel("vi", false)).toBe("Xem chi tiết lần chạy");
    expect(runDisclosureLabel("vi", true)).toBe("Ẩn chi tiết lần chạy");
  });

  it("only considers real run fields expandable", () => {
    expect(
      hasRunDetails({
        started_at: null,
        finished_at: null,
        error: null,
        stats: null,
        llm: undefined,
      })
    ).toBe(false);
    expect(
      hasRunDetails({
        started_at: 100,
        finished_at: null,
        error: null,
        stats: null,
        llm: undefined,
      })
    ).toBe(true);
    expect(
      hasRunDetails({
        started_at: null,
        finished_at: null,
        error: "timeout",
        stats: null,
        llm: undefined,
      })
    ).toBe(true);
  });
});

describe("safe run detail formatting", () => {
  it("keeps missing and malformed values visibly unknown", () => {
    expect(formatTimestamp(null, "en")).toBe("—");
    expect(formatTimestamp(Number.NaN, "en")).toBe("—");
    expect(formatScore(Number.NaN)).toBe("—");
    expect(formatTokenValue(null)).toBe("—");
    expect(
      safeRunSteps({ steps: "not-an-array" } as unknown as WorkflowRunStats)
    ).toEqual([]);
    expect(
      safeRunSteps({
        steps: [
          { name: "score", action: "scored 2" },
          { name: 42, action: "bad" },
        ],
      } as unknown as WorkflowRunStats)
    ).toEqual([{ name: "score", action: "scored 2" }]);
  });

  it("removes control characters and bounds operational error text", () => {
    expect(formatSafeDetail("  timeout\u0000\n  ")).toBe("timeout");
    expect(formatSafeDetail("x".repeat(20), 8)).toBe("xxxxxxx…");
    expect(formatSafeDetail(null)).toBe("—");
    expect(formatSafeError("anyrouter request failed: 401 secret body")).toBe(
      "anyrouter request failed: 401"
    );
    expect(formatSafeError("prompt: do not expose this")).toBe(
      "prompt: [redacted]"
    );
  });

  it("formats UTC timestamps without guessing a local timezone", () => {
    const formatted = formatTimestamp(1_700_000_000, "en");
    expect(formatted).toContain("2023");
    expect(formatted).toContain("UTC");
  });
});

describe("run axis labels", () => {
  it("anchors the x-axis tick to UTC, like formatTimestamp", () => {
    // 1700000000 is 2023-11-14T22:13:20Z. A local-time formatter would
    // render a different wall clock for a UTC+7 viewer, so the axis and the
    // run's own detail row would disagree on the same page.
    expect(runAxisTime(1_700_000_000, "en")).toBe("10:13 PM");
  });

  it("is stable regardless of the viewer's timezone", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "Asia/Bangkok";
      expect(runAxisTime(1_700_000_000, "en")).toBe("10:13 PM");
      process.env.TZ = "America/Los_Angeles";
      expect(runAxisTime(1_700_000_000, "en")).toBe("10:13 PM");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("reuses formatTimestamp for the tooltip heading, so the two agree", () => {
    expect(runAxisHeading(1_700_000_000, "en")).toBe(
      formatTimestamp(1_700_000_000, "en")
    );
    expect(runAxisHeading(1_700_000_000, "en")).toContain("UTC");
  });

  it("degrades a missing timestamp instead of printing Invalid Date", () => {
    for (const bad of [null, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(runAxisTime(bad, "en")).toBe("—");
      expect(runAxisHeading(bad, "en")).toBe("—");
    }
  });

  it("keeps a sub-minute duration in seconds and never rounds it to 0m", () => {
    expect(formatSecondsShort(0)).toBe("0s");
    expect(formatSecondsShort(45)).toBe("45s");
    expect(formatSecondsShort(59)).toBe("59s");
    expect(formatSecondsShort(60)).toBe("1m");
    expect(formatSecondsShort(157)).toBe("3m");
  });
});

describe("tokenBreakdown", () => {
  const attempt = {
    ts: 1_700_000_000_000,
    runId: "run-1",
    task: "score",
    model: "anyrouter/auto",
    ok: true,
    tokens: 100,
    durationMs: 40,
    promptChars: null,
    promptTokens: 60,
    completionTokens: 40,
    cachedTokens: 10,
    error: null,
    errorCode: null,
    errorStatus: null,
  };

  it("sums only the selected run's attributed usage", () => {
    expect(tokenBreakdown([attempt], { tokens: 999 }, undefined)).toEqual({
      total: 100,
      input: 60,
      output: 40,
      cached: 10,
    });
  });

  it("uses the same normalized total for compact and expanded views", () => {
    expect(normalizeRunTokens({ tokens: 120 }, undefined, [attempt])).toEqual({
      total: 100,
      cached: 10,
      source: "attempts",
    });
    expect(normalizeRunTokens({ tokens: 120 }, undefined)).toEqual({
      total: 120,
      cached: null,
      source: "stats",
    });
  });

  it("derives fallback only from failed→successful attempts in the same task", () => {
    const failed = {
      ...attempt,
      ok: false,
      tokens: 0,
      model: "anyrouter/auto",
      error: "timeout",
      errorCode: "timeout",
    };
    const successful = {
      ...attempt,
      model: "google/gemini",
      tokens: 20,
      promptTokens: 10,
      completionTokens: 10,
      cachedTokens: 0,
    };
    expect(fallbackTransitions([failed, successful])).toEqual([
      { task: "score", from: "anyrouter/auto", to: "google/gemini" },
    ]);
    expect(
      fallbackTransitions([
        { ...attempt, task: "score", model: "score/model" },
        { ...attempt, task: "translate", model: "translate/model" },
      ])
    ).toEqual([]);
  });

  it("marks an open run as in progress rather than empty", () => {
    expect(
      runStatus({
        started_at: 100,
        finished_at: null,
        items_fetched: 0,
        items_new: 0,
        error: null,
        id: "open",
        stats: null,
      })
    ).toBe("in_progress");
  });

  it("leaves optional usage unknown instead of turning it into zero", () => {
    expect(
      tokenBreakdown(
        [
          {
            ...attempt,
            promptTokens: null,
            completionTokens: null,
            cachedTokens: null,
          },
        ],
        null,
        undefined
      )
    ).toEqual({ total: 100, input: null, output: null, cached: null });
  });
});

describe("stepFallbackNotes (#189)", () => {
  it("mirrors an anyrouter fallback chain embedded in a step reason", () => {
    const notes = stepFallbackNotes([
      { name: "tldr", action: "skipped" },
      {
        name: "tldr",
        action: "skipped",
        reason:
          "anyrouter chain exhausted: openai/gpt-4o: anyrouter request failed: 502 | google/gemini: anyrouter provider error",
      },
    ]);

    expect(notes).toHaveLength(1);
    expect(notes[0]?.step).toBe("tldr");
    expect(notes[0]?.kind).toBe("chain_exhausted");
    expect(runFallbackKindLabel(notes[0]!.kind, "en")).toBe(
      "Fallback chain exhausted"
    );
    expect(notes[0]?.detail).toContain("anyrouter chain exhausted");
  });

  it("classifies a provider status inside a step reason", () => {
    const [note] = stepFallbackNotes([
      {
        name: "qa-translations",
        action: "review failed",
        reason: "anyrouter request failed: 429",
      },
    ]);
    expect(note?.kind).toBe("rate_limited");
    expect(runFallbackKindLabel(note!.kind, "vi")).toBe(
      "Bị giới hạn tần suất từ nhà cung cấp"
    );
  });

  it("keeps healthy and non-provider step explanations out of the error section", () => {
    expect(
      stepFallbackNotes([
        { name: "fetch", action: "48 items from 9 sources" },
        { name: "dedupe", action: "12 new", reason: "36 already in db" },
        { name: "translate", action: "translated 12/12 items" },
        { name: "email", action: "skipped", reason: "no eligible subscribers" },
        { name: "backfill-score", action: "0 candidates" },
      ])
    ).toEqual([]);
  });

  it("redacts anything that must not ride along in a step reason", () => {
    const [note] = stepFallbackNotes([
      {
        name: "tldr",
        action: "skipped",
        reason:
          "anyrouter chain exhausted: https://provider.test/raw?key=abcd1234efgh5678 authorization=Bearer sk-secret-value-1234",
      },
    ]);
    expect(note?.detail).not.toContain("provider.test");
    expect(note?.detail).not.toContain("sk-secret-value-1234");
  });
});

describe("isPreIdentityRun (#189)", () => {
  const preIdentityStats: WorkflowRunStats = { tokens: 13_700 };
  const attempt: LlmCallRow = {
    ts: 1_700_000_010_000,
    runId: "run-1",
    task: "score",
    model: "anyrouter/auto",
    ok: true,
    tokens: 100,
    durationMs: 20,
    promptChars: 10,
    promptTokens: 80,
    completionTokens: 20,
    cachedTokens: 0,
    error: null,
    errorCode: null,
    errorStatus: null,
  };

  it("labels a run with tokens but no attributable attempts", () => {
    expect(isPreIdentityRun(preIdentityStats, undefined, [])).toBe(true);
  });

  it("does not label a run that has attempt rows or no tokens", () => {
    expect(isPreIdentityRun(preIdentityStats, undefined, [attempt])).toBe(
      false
    );
    expect(
      isPreIdentityRun(
        preIdentityStats,
        {
          calls: 1,
          failures: 0,
          tokens: 100,
          cachedTokens: 0,
          durationMs: 20,
          models: ["anyrouter/auto"],
          attempts: [],
        },
        []
      )
    ).toBe(false);
    expect(isPreIdentityRun({ tokens: 0 }, undefined, [])).toBe(false);
    expect(isPreIdentityRun(null, undefined, [])).toBe(false);
  });
});
