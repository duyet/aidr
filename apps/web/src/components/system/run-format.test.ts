import { describe, expect, it } from "vitest";
import {
  bySourceSubline,
  extraBadges,
  formatDuration,
  formatDurationSec,
  formatMs,
  llmTokens,
  shortModel,
  statusVariant,
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
