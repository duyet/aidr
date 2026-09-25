import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedApiUrl } from "./feed-cache";
import { FEED_FRESHNESS_CLIENT_TTL_MS } from "./feed-freshness";
import type { FeedResponse } from "./types";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
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

const START = Date.parse("2026-09-25T00:00:00.000Z");

async function freshFeedCache() {
  vi.resetModules();
  return import("./feed-cache");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("feed freshness cache", () => {
  it("makes one slim request and zero full-feed requests for a fresh page", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
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
    expect(calls).toEqual(["/api/feed/freshness"]);
    expect(calls).not.toContain("/api/feed");
  });

  it("caches a valid null separately from an unloaded cache", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ lastFetchedAt: null }));
    vi.stubGlobal("fetch", fetchMock);
    const cache = await freshFeedCache();

    expect(await cache.fetchFeedFreshnessOnce()).toBeNull();
    expect(await cache.fetchFeedFreshnessOnce()).toBeNull();
    expect(await cache.fetchFeedFreshnessOnce()).toBeNull();
    expect(cache.getCachedFeedFreshness()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses a value across remounts, then revalidates at the TTL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ lastFetchedAt: 10 }))
      .mockResolvedValueOnce(jsonResponse({ lastFetchedAt: 20 }));
    vi.stubGlobal("fetch", fetchMock);
    const cache = await freshFeedCache();

    expect(await cache.fetchFeedFreshnessOnce()).toBe(10);
    vi.advanceTimersByTime(FEED_FRESHNESS_CLIENT_TTL_MS - 1);
    expect(await cache.fetchFeedFreshnessOnce()).toBe(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(cache.getCachedFeedFreshness()).toBeNull();
    expect(await cache.fetchFeedFreshnessOnce()).toBe(20);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache a non-2xx response and retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "down" }, 503))
      .mockResolvedValueOnce(jsonResponse({ lastFetchedAt: 30 }));
    vi.stubGlobal("fetch", fetchMock);
    const cache = await freshFeedCache();

    expect(await cache.fetchFeedFreshnessOnce()).toBeNull();
    expect(await cache.fetchFeedFreshnessOnce()).toBe(30);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache parse or shape failures and retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("not-json"))
      .mockResolvedValueOnce(jsonResponse({ lastFetchedAt: "bad" }))
      .mockResolvedValueOnce(jsonResponse({ lastFetchedAt: 40 }));
    vi.stubGlobal("fetch", fetchMock);
    const cache = await freshFeedCache();

    expect(await cache.fetchFeedFreshnessOnce()).toBeNull();
    expect(await cache.fetchFeedFreshnessOnce()).toBeNull();
    expect(await cache.fetchFeedFreshnessOnce()).toBe(40);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not cache a network failure and retries", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(jsonResponse({ lastFetchedAt: 50 }));
    vi.stubGlobal("fetch", fetchMock);
    const cache = await freshFeedCache();

    expect(await cache.fetchFeedFreshnessOnce()).toBeNull();
    expect(await cache.fetchFeedFreshnessOnce()).toBe(50);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("leaves the full feed consumer on an explicit locale URL", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/feed?lang=vi");
      return jsonResponse(feed);
    });
    vi.stubGlobal("fetch", fetchMock);
    const cache = await freshFeedCache();

    await expect(cache.fetchFeedOnce("vi")).resolves.toEqual(feed);
    await expect(cache.fetchFeedOnce("vi")).resolves.toEqual(feed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.getCachedFeed("vi")).toEqual(feed);
    expect(cache.getCachedFeedFreshness()).toBe(feed.lastFetchedAt);
  });

  it("keeps English and Vietnamese feed bodies in separate cache slots", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const lang = new URL(
        String(input),
        "https://aidr.today"
      ).searchParams.get("lang");
      return jsonResponse({ ...feed, lang });
    });
    vi.stubGlobal("fetch", fetchMock);
    const cache = await freshFeedCache();

    await expect(cache.fetchFeedOnce("en")).resolves.toMatchObject({
      lang: "en",
    });
    await expect(cache.fetchFeedOnce("vi")).resolves.toMatchObject({
      lang: "vi",
    });
    expect(cache.getCachedFeed("en")?.lang).toBe("en");
    expect(cache.getCachedFeed("vi")?.lang).toBe("vi");
    expect(feedApiUrl("en")).toBe("/api/feed?lang=en");
    expect(feedApiUrl("vi")).toBe("/api/feed?lang=vi");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
