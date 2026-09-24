import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedResponse } from "./types";

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data));
}

const feed: FeedResponse = {
  tldr: null,
  days: [],
  categories: [],
  trending: [],
  totalStories: 0,
  updatedAt: 1,
  lastFetchedAt: 1_700_000_042,
  hasMore: false,
};

async function freshFeedCache() {
  vi.resetModules();
  return import("./feed-cache");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("feed freshness cache", () => {
  it("uses the slim endpoint for a page without a feed body", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/feed/freshness");
      return jsonResponse({ lastFetchedAt: 1_700_000_042 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const cache = await freshFeedCache();

    expect(cache.getCachedFeedFreshness()).toBeNull();
    const [first, second] = await Promise.all([
      cache.fetchFeedFreshnessOnce(),
      cache.fetchFeedFreshnessOnce(),
    ]);

    expect(first).toBe(1_700_000_042);
    expect(second).toBe(1_700_000_042);
    expect(await cache.fetchFeedFreshnessOnce()).toBe(1_700_000_042);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/feed");
  });

  it("leaves the full feed consumer on /api/feed", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/feed");
      return jsonResponse(feed);
    });
    vi.stubGlobal("fetch", fetchMock);
    const cache = await freshFeedCache();

    await expect(cache.fetchFeedOnce()).resolves.toEqual(feed);
    await expect(cache.fetchFeedOnce()).resolves.toEqual(feed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.getCachedFeed()).toEqual(feed);
    expect(cache.getCachedFeedFreshness()).toBe(feed.lastFetchedAt);
  });
});
