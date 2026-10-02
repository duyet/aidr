import { describe, expect, it, vi } from "vitest";

const items = Array.from({ length: 10 }, (_, i) => ({
  url: `https://example.com/${i}`,
  title: `Story ${i}`,
  publishedAt: 1_000 + i,
  points: 0,
  comments: 0,
}));

vi.mock("../sources/marketbrief.js", () => ({
  marketBriefAdapter: { type: "marketbrief", fetchItems: async () => items },
}));
vi.mock("../sources/huggingnews.js", () => ({
  huggingNewsAdapter: { type: "huggingnews", fetchItems: async () => items },
}));

import { adapters } from "../sources/registry.js";

describe("aggregator flood gate", () => {
  it.each(["marketbrief", "huggingnews"])(
    "%s keeps only the newest maxItems so it cannot starve the scorer",
    async (type) => {
      const out = await adapters[type].fetchItems({ maxItems: 4 }, 0);
      expect(out.map((i) => i.title)).toEqual([
        "Story 9",
        "Story 8",
        "Story 7",
        "Story 6",
      ]);
    }
  );

  it("returns everything when no cap is configured", async () => {
    expect(await adapters.marketbrief.fetchItems({}, 0)).toHaveLength(10);
  });
});
