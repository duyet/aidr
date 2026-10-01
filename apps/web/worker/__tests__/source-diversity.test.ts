import { describe, expect, it } from "vitest";
import {
  familyCapFor,
  familyCounts,
  pickDiverse,
  sourceFamily,
} from "../source-diversity.js";

const row = (id: string, source_id: string) => ({ id, source_id });
const familyOf = (rows: { source_id: string }[]) => {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const f = sourceFamily(r.source_id);
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return counts;
};

describe("sourceFamily", () => {
  it("groups the two mirrored aggregators so they share one cap", () => {
    // huggingnews and marketbrief publish the same stories under the same
    // slugs; capping them separately would let the pair hold twice the share.
    expect(sourceFamily("huggingnews")).toBe(sourceFamily("marketbrief"));
    expect(sourceFamily("hn")).not.toBe(sourceFamily("huggingnews"));
  });

  it("treats an unknown (operator-added) source as its own family", () => {
    expect(sourceFamily("some-new-feed")).toBe("some-new-feed");
  });
});

describe("pickDiverse", () => {
  // Ranked like production on 2026-10-01: a wall of aggregator rows on top.
  const ranked = [
    ...Array.from({ length: 12 }, (_, i) =>
      row(`agg${i}`, i % 2 ? "huggingnews" : "marketbrief")
    ),
    row("tc", "techcrunch-ai"),
    row("verge1", "theverge-ai"),
    row("verge2", "theverge-ai"),
    row("hn", "hn"),
    ...Array.from({ length: 10 }, (_, i) => row(`arx${i}`, "arxiv-research")),
    ...Array.from({ length: 8 }, (_, i) => row(`ind${i}`, `independent-${i}`)),
  ];

  it("holds the family cap when enough other candidates exist", () => {
    for (const limit of [8, 10, 16]) {
      const out = pickDiverse(ranked, { limit });
      expect(out).toHaveLength(limit);
      for (const n of familyOf(out).values()) {
        expect(n).toBeLessThanOrEqual(familyCapFor(limit));
      }
    }
  });

  it("keeps rank order among the rows it picks", () => {
    const out = pickDiverse(ranked, { limit: 10 });
    const positions = out.map((r) => ranked.indexOf(r));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("is a no-op when no family is over its share", () => {
    const varied = ranked.filter(
      (_, i) => i === 0 || (i >= 12 && i <= 15) || i === 16
    );
    expect(pickDiverse(varied, { limit: varied.length + 4 })).toEqual(varied);
  });

  it("backfills from the best skipped rows instead of shrinking the list", () => {
    const onlyAgg = ranked.slice(0, 12);
    const out = pickDiverse(onlyAgg, { limit: 8 });
    expect(out).toHaveLength(8);
    // Capped picks come first so a caller taking the head gets one of them.
    expect(new Set(out.map((r) => r.id))).toEqual(
      new Set(onlyAgg.slice(0, 8).map((r) => r.id))
    );
  });

  it("counts families used earlier in the day via initialCounts", () => {
    const out = pickDiverse(ranked, {
      limit: 3,
      maxPerFamily: 1,
      initialCounts: familyCounts([{ source_id: "huggingnews", n: 1 }]),
    });
    // The aggregator already posted today, so the head is another family.
    expect(sourceFamily(out[0].source_id)).not.toBe(
      sourceFamily("marketbrief")
    );
    expect(out).toHaveLength(3);
  });
});

describe("familyCounts", () => {
  it("sums sources of one family", () => {
    const counts = familyCounts([
      { source_id: "huggingnews", n: 2 },
      { source_id: "marketbrief", n: 1 },
      { source_id: "hn", n: 1 },
    ]);
    expect(counts.get(sourceFamily("huggingnews"))).toBe(3);
    expect(counts.get("hn")).toBe(1);
  });
});
