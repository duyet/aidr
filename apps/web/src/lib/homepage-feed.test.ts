import { describe, expect, it } from "vitest";
import {
  DAY_STORY_LIMIT,
  dayFeedParams,
  mergeRefreshedFeed,
  shapeHomepageFeed,
} from "./homepage-feed";
import type { DayGroup, FeedItem, FeedResponse } from "./types";

function item(id: string, extra: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    url: "https://example.com/story",
    title: id,
    title_vi: null,
    summary: null,
    summary_vi: null,
    category: "models",
    published_at: 1_700_000_000,
    points: 0,
    comments: 0,
    rank_score: 0,
    source_id: "hn",
    tags: [],
    sources: [],
    llm_tokens: 0,
    image_url: null,
    ...extra,
  };
}

function day(date: string, n: number): DayGroup {
  return {
    date,
    items: Array.from({ length: n }, (_, i) => item(`${date}-${i}`)),
    categoryCounts: { models: n },
  };
}

function feed(days: DayGroup[], extra: Partial<FeedResponse> = {}) {
  return {
    tldr: null,
    days,
    categories: [],
    trending: [],
    totalStories: days.reduce((t, d) => t + d.items.length, 0),
    updatedAt: 0,
    lastFetchedAt: null,
    hasMore: false,
    ...extra,
  } satisfies FeedResponse;
}

// The homepage HTML was 1.2 MB because SSR carried three days of rows. The
// first view only needs the newest day, capped, with the rest on demand.
describe("shapeHomepageFeed", () => {
  it("keeps only the newest day, so yesterday stands in before today's edition", () => {
    const out = shapeHomepageFeed(
      feed([day("2026-10-10", 5), day("2026-10-09", 5)])
    );
    expect(out.days.map((d) => d.date)).toEqual(["2026-10-10"]);
    // Older days were dropped from the payload, so the pager must offer them.
    expect(out.hasMore).toBe(true);
  });

  it("caps the day and records its true size for the count and Load more", () => {
    const out = shapeHomepageFeed(feed([day("2026-10-11", 78)]));
    expect(out.days[0].items).toHaveLength(DAY_STORY_LIMIT);
    expect(out.days[0].totalItems).toBe(78);
    expect(out.hasMore).toBe(false);
  });

  it("leaves a small day whole, with no totalItems", () => {
    const out = shapeHomepageFeed(feed([day("2026-10-11", 3)]));
    expect(out.days[0].items).toHaveLength(3);
    expect(out.days[0].totalItems).toBeUndefined();
  });

  it("carries the topic fields of digest stories that were cut", () => {
    const older = day("2026-10-10", 1);
    older.items[0] = item("old", {
      category: "agents",
      tags: ["Claude"],
      image_url: "https://img.example/x.png",
    });
    const out = shapeHomepageFeed(
      feed([day("2026-10-11", 1), older], {
        tldr: {
          date: "2026-10-11",
          bullets_en: [{ text: "a", item_ids: ["2026-10-11-0", "old"] }],
          bullets_vi: [],
        },
      })
    );
    // The kept story is in `days`; only the cut one rides in tldrItems.
    expect(out.tldrItems).toEqual([
      {
        id: "old",
        category: "agents",
        tags: ["Claude"],
        image_url: "https://img.example/x.png",
      },
    ]);
  });
});

describe("mergeRefreshedFeed", () => {
  it("updates days on screen without pulling older days back in", () => {
    const prev = shapeHomepageFeed(
      feed([day("2026-10-11", 40), day("2026-10-10", 5)])
    );
    const next = feed([day("2026-10-11", 45), day("2026-10-10", 5)]);
    const out = mergeRefreshedFeed(prev, next);
    expect(out.days.map((d) => d.date)).toEqual(["2026-10-11"]);
    expect(out.days[0].items).toHaveLength(45);
    expect(out.hasMore).toBe(true);
  });

  it("adds a new day and keeps older days the reader loaded", () => {
    const prev = feed([day("2026-10-10", 2), day("2026-10-05", 2)]);
    const next = feed([day("2026-10-11", 1), day("2026-10-10", 3)]);
    const out = mergeRefreshedFeed(prev, next);
    expect(out.days.map((d) => [d.date, d.items.length])).toEqual([
      ["2026-10-11", 1],
      ["2026-10-10", 3],
      ["2026-10-05", 2],
    ]);
  });
});

describe("mergeRefreshedFeed digest stories", () => {
  // /api/feed carries no tldrItems. Without rebuilding them, a refresh two
  // minutes after load would strip the topic colour from digest rows that
  // point at yesterday's stories.
  it("keeps topic fields for digest stories outside the shown days", () => {
    const tldr = {
      date: "2026-10-11",
      bullets_en: [{ text: "a", item_ids: ["old"] }],
      bullets_vi: [],
    };
    const yesterday: DayGroup = {
      date: "2026-10-10",
      items: [item("old", { tags: ["Claude"] })],
      categoryCounts: {},
    };
    const prev = shapeHomepageFeed(
      feed([day("2026-10-11", 2), yesterday], { tldr })
    );
    expect(prev.tldrItems?.map((i) => i.id)).toEqual(["old"]);
    const next = feed([day("2026-10-11", 3), yesterday], { tldr });
    const out = mergeRefreshedFeed(prev, next);
    expect(out.days.map((d) => d.date)).toEqual(["2026-10-11"]);
    expect(out.tldrItems).toEqual([
      { id: "old", category: "models", tags: ["Claude"], image_url: null },
    ]);
  });
});

describe("dayFeedParams", () => {
  // getFeed reads the `days` window that ends at `before`'s midnight, so
  // one day ending at the next day's midnight is exactly `date`.
  it("asks for one day ending at the next midnight, across month ends", () => {
    expect(dayFeedParams("2026-10-11")).toEqual({
      days: "1",
      before: "2026-10-12",
    });
    expect(dayFeedParams("2026-12-31")).toEqual({
      days: "1",
      before: "2027-01-01",
    });
  });
});
