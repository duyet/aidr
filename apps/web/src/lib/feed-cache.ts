import type { FeedFreshness } from "./feed-freshness";
import { setLearnedKeywords } from "./highlight";
import type { FeedResponse } from "./types";

/**
 * Module-level cache of the unfiltered /api/feed response, shared by the
 * homepage (which fetches it anyway) and the header SearchBox typeahead
 * (which needs it on pages that never fetch the feed, e.g. /about). The
 * response is edge-cached, so a second fetch here is cheap and never
 * stale for longer than the CDN's TTL.
 */
let cache: FeedResponse | null = null;
let inflight: Promise<FeedResponse | null> | null = null;
let freshnessCache: FeedFreshness | null = null;
let freshnessInflight: Promise<number | null> | null = null;

export function getCachedFeed(): FeedResponse | null {
  return cache;
}

/** The footer only needs the newest ingest timestamp, not the feed body. */
export function getCachedFeedFreshness(): number | null {
  if (cache) return cache.lastFetchedAt;
  return freshnessCache?.lastFetchedAt ?? null;
}

/** Fetches the slim freshness endpoint once, sharing an in-flight request. */
export function fetchFeedFreshnessOnce(): Promise<number | null> {
  if (cache) {
    freshnessCache = { lastFetchedAt: cache.lastFetchedAt };
    return Promise.resolve(cache.lastFetchedAt);
  }
  if (freshnessCache) return Promise.resolve(freshnessCache.lastFetchedAt);
  if (freshnessInflight) return freshnessInflight;

  freshnessInflight = fetch("/api/feed/freshness")
    .then((res) => (res.ok ? (res.json() as Promise<FeedFreshness>) : null))
    .then((res) => {
      freshnessInflight = null;
      if (!res) return null;
      freshnessCache = res;
      return res.lastFetchedAt;
    })
    .catch(() => {
      freshnessInflight = null;
      return null;
    });
  return freshnessInflight;
}

/** Called by the homepage once it has its own unfiltered (no `q`) fetch,
 * so the typeahead doesn't need a second network round-trip there. */
export function setCachedFeed(feed: FeedResponse): void {
  cache = feed;
  freshnessCache = { lastFetchedAt: feed.lastFetchedAt };
  if (feed.learnedKeywords?.length) setLearnedKeywords(feed.learnedKeywords);
}

/** Fetches once and caches; concurrent callers share the same in-flight
 * request. Returns null on any fetch/parse failure. */
export function fetchFeedOnce(): Promise<FeedResponse | null> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch("/api/feed")
    .then((res) => (res.ok ? (res.json() as Promise<FeedResponse>) : null))
    .then((res) => {
      inflight = null;
      if (res) {
        cache = res;
        freshnessCache = { lastFetchedAt: res.lastFetchedAt };
      }
      return res;
    })
    .catch(() => {
      inflight = null;
      return null;
    });
  return inflight;
}
