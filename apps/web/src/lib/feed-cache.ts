import {
  FEED_FRESHNESS_CLIENT_TTL_MS,
  type FeedFreshness,
  isFeedFreshness,
} from "./feed-freshness";
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

interface FreshnessCacheEntry {
  value: FeedFreshness;
  expiresAt: number;
}

/** `null` means unloaded; an entry with a null value is a valid empty result. */
let freshnessCache: FreshnessCacheEntry | null = null;
let freshnessInflight: Promise<number | null> | null = null;

function setFreshnessEntry(value: FeedFreshness): void {
  if (!isFeedFreshness(value)) return;
  freshnessCache = {
    value,
    expiresAt: Date.now() + FEED_FRESHNESS_CLIENT_TTL_MS,
  };
}

function validFreshnessEntry(now = Date.now()): FreshnessCacheEntry | null {
  if (!freshnessCache) return null;
  if (freshnessCache.expiresAt <= now) {
    freshnessCache = null;
    return null;
  }
  return freshnessCache;
}

export function getCachedFeed(): FeedResponse | null {
  return cache;
}

/** The footer only needs the newest published-item timestamp, not feed data. */
export function getCachedFeedFreshness(): number | null {
  return validFreshnessEntry()?.value.lastFetchedAt ?? null;
}

/**
 * Fetch the slim endpoint once, sharing an in-flight request. Successful
 * values (including null) live for the client TTL; failures and malformed
 * responses are not cached, so the next call retries.
 */
export function fetchFeedFreshnessOnce(): Promise<number | null> {
  const cached = validFreshnessEntry();
  if (cached) return Promise.resolve(cached.value.lastFetchedAt);
  if (freshnessInflight) return freshnessInflight;

  freshnessInflight = fetch("/api/feed/freshness")
    .then((res) => (res.ok ? res.json().catch(() => null) : null))
    .then((body) => {
      freshnessInflight = null;
      if (!isFeedFreshness(body)) return null;
      setFreshnessEntry(body);
      return body.lastFetchedAt;
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
  setFreshnessEntry({ lastFetchedAt: feed.lastFetchedAt });
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
        setFreshnessEntry({ lastFetchedAt: res.lastFetchedAt });
      }
      return res;
    })
    .catch(() => {
      inflight = null;
      return null;
    });
  return inflight;
}
