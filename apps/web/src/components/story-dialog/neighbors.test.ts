import { describe, expect, it } from "vitest";
import type { FeedItem } from "../../lib/types";
import { neighborId } from "./neighbors";

const at = (id: string) => ({ id }) as FeedItem;
const feed = {
  days: [
    {
      date: "2026-11-16",
      categoryCounts: {},
      items: [at("a"), at("b"), at("c")],
    },
    { date: "2026-11-15", categoryCounts: {}, items: [at("d"), at("e")] },
  ],
};

describe("neighborId", () => {
  it("steps within the day that holds the story, in feed order", () => {
    expect(neighborId(feed, "b", 1)).toBe("c");
    expect(neighborId(feed, "b", -1)).toBe("a");
    expect(neighborId(feed, "d", 1)).toBe("e");
  });

  it("stops at the ends of a day instead of crossing into the next", () => {
    expect(neighborId(feed, "c", 1)).toBeNull();
    expect(neighborId(feed, "a", -1)).toBeNull();
    expect(neighborId(feed, "d", -1)).toBeNull();
  });

  it("has no neighbor for a story the feed does not hold, or no feed", () => {
    expect(neighborId(feed, "zzz", 1)).toBeNull();
    expect(neighborId(null, "a", 1)).toBeNull();
  });
});
