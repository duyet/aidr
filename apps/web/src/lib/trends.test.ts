import { describe, expect, it } from "vitest";
import {
  buildTrends,
  canonicalTrendName,
  formatTrack,
  isModelName,
  MAX_TRACKED,
  parseTrack,
  rankModels,
  risers,
  type TrendSeries,
  trackSlots,
  trendInsights,
  windowStat,
} from "./trends";

const TODAY = "2026-10-12";

/** 16 days: index 0 is the oldest, index 15 is today (partial). */
function series(
  name: string,
  counts: number[],
  kind: TrendSeries["kind"] = "topic"
): TrendSeries {
  return { name, kind, counts };
}

const FLAT = Array(16).fill(2);

describe("buildTrends", () => {
  it("zero-fills days with no rows and keeps today as the last day", () => {
    const t = buildTrends(
      [{ day: "2026-10-10", name: "agent", count: 4 }],
      [],
      TODAY,
      5
    );
    expect(t.days).toEqual([
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
    ]);
    expect(t.series).toEqual([
      { name: "agent", kind: "topic", counts: [0, 0, 4, 0, 0] },
    ]);
  });

  it("folds vendor-prefixed model aliases into one series", () => {
    const t = buildTrends(
      [
        { day: TODAY, name: "sonnet-5.5", count: 2 },
        { day: TODAY, name: "claude-sonnet-5.5", count: 3 },
      ],
      [],
      TODAY,
      2
    );
    expect(t.series).toEqual([
      { name: "sonnet-5.5", kind: "model", counts: [0, 5] },
    ]);
  });

  it("drops rows outside the window", () => {
    const t = buildTrends(
      [{ day: "2026-09-01", name: "agent", count: 9 }],
      [],
      TODAY,
      3
    );
    expect(t.series).toEqual([]);
  });
});

describe("isModelName", () => {
  it("separates versioned models from companies and products", () => {
    for (const m of ["gpt-6.1-sol", "opus-5.5", "gemini-4-argon", "o3"]) {
      expect(isModelName(m)).toBe(true);
    }
    for (const t of ["openai", "claude-code", "open-source", "deepseek"]) {
      expect(isModelName(t)).toBe(false);
    }
  });

  it("canonicalizes only Claude tier aliases", () => {
    expect(canonicalTrendName(" Claude-Opus-5.5 ")).toBe("opus-5.5");
    expect(canonicalTrendName("claude-code")).toBe("claude-code");
  });
});

describe("windowStat", () => {
  it("ignores today's partial count", () => {
    const counts = [...FLAT.slice(0, 15), 500];
    const s = windowStat(series("agent", counts));
    expect(s.current).toBe(14);
    expect(s.prior).toBe(14);
    expect(s.delta).toBe(0);
  });

  it("flags a name with no history before the current window as new", () => {
    const counts = [...Array(8).fill(0), 1, 1, 1, 0, 0, 0, 0, 0];
    expect(windowStat(series("muse-2", counts)).isNew).toBe(true);
    const old = [1, ...counts.slice(1)];
    expect(windowStat(series("muse-2", old)).isNew).toBe(false);
  });
});

describe("risers and insights", () => {
  const riser = series("funding", [
    ...Array(8).fill(1),
    ...Array(7).fill(5),
    0,
  ]);
  const tiny = series("one-off", [...Array(14).fill(0), 2, 0]);
  const steady = series("llm", FLAT);

  it("needs a minimum count so a 0 -> 2 blip never ranks", () => {
    expect(risers([riser, tiny, steady], "topic").map((r) => r.name)).toEqual([
      "funding",
    ]);
  });

  it("computes the headline cards from the series", () => {
    const entrant = series(
      "muse-2",
      [...Array(8).fill(0), ...Array(7).fill(1), 0],
      "model"
    );
    const category = series(
      "Models",
      [...Array(8).fill(10), ...Array(7).fill(15), 3],
      "category"
    );
    const i = trendInsights({
      days: [],
      series: [riser, tiny, steady, entrant, category],
    });
    expect(i.biggestRiser?.name).toBe("funding");
    expect(i.newEntrant?.name).toBe("muse-2");
    expect(i.topModel?.name).toBe("muse-2");
    expect(i.volume).toEqual({ current: 105, prior: 70, changePct: 50 });
  });

  it("reports no volume change when there is no prior week", () => {
    const i = trendInsights({ days: [], series: [] });
    expect(i.volume.changePct).toBeNull();
    expect(i.biggestRiser).toBeNull();
  });
});

describe("rankModels", () => {
  it("returns the prior-window rank so the UI can show movement", () => {
    const a = series(
      "gpt-6",
      [...Array(8).fill(3), ...Array(7).fill(1), 0],
      "model"
    );
    const b = series(
      "opus-5.5",
      [...Array(8).fill(1), ...Array(7).fill(4), 0],
      "model"
    );
    const ranked = rankModels([a, b]);
    expect(ranked.map((r) => [r.name, r.rank, r.priorRank])).toEqual([
      ["opus-5.5", 1, 2],
      ["gpt-6", 2, 1],
    ]);
  });
});

describe("track search param", () => {
  it("sanitizes, dedupes, and caps pins", () => {
    expect(parseTrack("Agent, agent,<x>,opus-5.5,,claude-opus-5.5")).toEqual([
      "agent",
      "x",
      "opus-5.5",
    ]);
    const many = Array.from({ length: 10 }, (_, i) => `t${i}`).join(",");
    expect(parseTrack(many)).toHaveLength(MAX_TRACKED);
    expect(parseTrack(["agent"])).toEqual([]);
  });

  it("round-trips and omits an empty list", () => {
    expect(formatTrack(parseTrack("llm,agent"))).toBe("llm,agent");
    expect(formatTrack([])).toBeUndefined();
  });
});

describe("trackSlots", () => {
  it("keeps a survivor's color when an earlier pin is removed", () => {
    const before = trackSlots(["agent", "llm", "opus-5.5", "funding"]);
    const after = trackSlots(["llm", "opus-5.5", "funding"]);
    for (const [name, slot] of after) expect(slot).toBe(before.get(name));
  });

  it("probes past a collision so two pins never share a color", () => {
    const slots = trackSlots(["opus-5.5", "gpt-6.1-sol"]);
    expect(slots.get("opus-5.5")).not.toBe(slots.get("gpt-6.1-sol"));
    const six = trackSlots(["a", "b", "c", "d", "e", "f"]);
    expect(new Set(six.values()).size).toBe(6);
  });
});
