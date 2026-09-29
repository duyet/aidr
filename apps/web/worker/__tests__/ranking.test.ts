import { describe, expect, it } from "vitest";
import {
  buildRerankQuery,
  rankScore,
  SOURCE_COUNT_COLUMN,
  sourceBoost,
} from "../ranking.js";

const NOW = Date.now();

describe("rankScore", () => {
  it("decays with age", () => {
    const fresh = rankScore({
      importance: 8,
      quality: 8,
      points: 100,
      comments: 20,
      publishedAt: NOW,
      now: NOW,
    });
    const old = rankScore({
      importance: 8,
      quality: 8,
      points: 100,
      comments: 20,
      publishedAt: NOW - 48 * 60 * 60 * 1000,
      now: NOW,
    });
    expect(old).toBeLessThan(fresh);
  });

  it("is monotonic in engagement (points/comments)", () => {
    const base = { importance: 5, quality: 5, publishedAt: NOW, now: NOW };
    const low = rankScore({ ...base, points: 1, comments: 0 });
    const high = rankScore({ ...base, points: 500, comments: 200 });
    expect(high).toBeGreaterThan(low);
  });

  it("is monotonic in quality", () => {
    const base = {
      importance: 5,
      points: 10,
      comments: 5,
      publishedAt: NOW,
      now: NOW,
    };
    const lowQuality = rankScore({ ...base, quality: 1 });
    const highQuality = rankScore({ ...base, quality: 10 });
    expect(highQuality).toBeGreaterThan(lowQuality);
  });

  it("scales with importance", () => {
    const base = {
      quality: 5,
      points: 10,
      comments: 5,
      publishedAt: NOW,
      now: NOW,
    };
    const lowImportance = rankScore({ ...base, importance: 1 });
    const highImportance = rankScore({ ...base, importance: 10 });
    expect(highImportance).toBeGreaterThan(lowImportance);
  });

  it("never returns negative for valid inputs", () => {
    const score = rankScore({
      importance: 0,
      quality: 0,
      points: 0,
      comments: 0,
      publishedAt: NOW,
      now: NOW,
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("TRENDING_MIN_RANK reachability", () => {
  it("can exceed 25 for an exceptional fresh, well-engaged story", () => {
    // importance 10 × quality 1.0 × decay 1.0 × (1+log10(1+200+20))
    const score = rankScore({
      importance: 10,
      quality: 10,
      points: 200,
      comments: 40,
      publishedAt: NOW,
      now: NOW,
    });
    expect(score).toBeGreaterThanOrEqual(25);
  });

  it("prefers multi-source items over a thin single-source duplicate of equal quality", () => {
    const base = {
      importance: 7,
      quality: 6,
      points: 20,
      comments: 4,
      publishedAt: NOW,
      now: NOW,
    };
    const thin = rankScore({ ...base, sourceCount: 1 });
    const backed = rankScore({ ...base, sourceCount: 4 });
    expect(backed).toBeGreaterThan(thin);
    expect(backed / thin).toBeCloseTo(sourceBoost(4) / sourceBoost(1), 5);
  });

  it("caps corroboration so mirror piles cannot dominate", () => {
    const base = {
      importance: 7,
      quality: 6,
      points: 20,
      comments: 4,
      publishedAt: NOW,
      now: NOW,
    };
    const eight = rankScore({ ...base, sourceCount: 8 });
    const twenty = rankScore({ ...base, sourceCount: 20 });
    expect(twenty).toBe(eight);
    expect(sourceBoost(0)).toBe(1);
    expect(sourceBoost(1)).toBeGreaterThan(1);
  });

  it("stays below 25 for a typical live-max story (~importance 8, modest engagement)", () => {
    const score = rankScore({
      importance: 8,
      quality: 8,
      points: 40,
      comments: 10,
      publishedAt: NOW - 6 * 60 * 60 * 1000,
      now: NOW,
    });
    expect(score).toBeLessThan(25);
  });
});

describe("hourly re-rank keeps the source boost", () => {
  // Prod 2026-09-29, item 98b45e32: 8 item_sources, cleared rank 20 at
  // insert, then the hourly re-rank rewrote it without sourceCount and it
  // fell under the trending bar (8.66 stored at ~8h old).
  const item = {
    importance: 7,
    quality: 1,
    points: 13,
    comments: 25,
    publishedAt: 1_790_659_371_000,
    now: 1_790_659_371_000 + 8.09 * 3_600_000,
  };

  it("matches the stored prod score only when the boost is dropped", () => {
    expect(rankScore(item)).toBeCloseTo(8.66, 1);
    expect(rankScore({ ...item, sourceCount: 8 })).toBeCloseTo(
      rankScore(item) * sourceBoost(8),
      6
    );
  });

  it("selects source_count for every re-ranked row", () => {
    expect(buildRerankQuery()).toContain(SOURCE_COUNT_COLUMN);
    expect(SOURCE_COUNT_COLUMN).toMatch(/AS source_count$/);
  });
});
