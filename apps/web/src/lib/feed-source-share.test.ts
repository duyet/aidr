import { describe, expect, it } from "vitest";
import { capSourceShare } from "./feed-queries";

const mk = (source_id: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ source_id, rank_score: i }));

const share = (items: { source_id: string }[], id: string) =>
  items.filter((i) => i.source_id === id).length / items.length;

describe("capSourceShare (#230: no source over 25% of the feed)", () => {
  it("cuts a flooding source (94 of 292) to at most 25%", () => {
    const items = [
      ...mk("marketbrief", 94),
      ...mk("huggingnews", 35),
      ...mk("a", 30),
      ...mk("b", 30),
      ...mk("c", 30),
      ...mk("d", 30),
      ...mk("e", 30),
      ...mk("f", 13),
    ];
    const out = capSourceShare(items);
    for (const id of ["marketbrief", "huggingnews", "a", "b", "c", "d", "e"]) {
      expect(share(out, id)).toBeLessThanOrEqual(0.25);
    }
    expect(out.length).toBeLessThan(items.length);
  });

  it("keeps the highest-ranked items of the capped source", () => {
    const items = [
      ...mk("flood", 40),
      ...mk("a", 5),
      ...mk("b", 5),
      ...mk("c", 5),
    ];
    const kept = capSourceShare(items).filter((i) => i.source_id === "flood");
    expect(Math.min(...kept.map((i) => i.rank_score))).toBeGreaterThan(30);
  });

  it("leaves the feed alone when fewer than 4 sources make the cap unsatisfiable", () => {
    expect(capSourceShare([...mk("a", 50), ...mk("b", 5)])).toHaveLength(55);
  });
});
