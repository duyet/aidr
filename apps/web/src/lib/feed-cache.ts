import {
  FEED_FRESHNESS_CLIENT_TTL_MS,
  type FeedFreshness,
  isFeedFreshness,
} from "./feed-freshness";
import { setLearnedKeywords } from "./highlight";
import { withLang } from "./locale-url";
import type { LatestRunSummary } from "./run-health";
import type { FeedResponse, Lang } from "./types";

/**
 * Module-level caches of the unfiltered /api/feed response, shared by the
 * homepage and header typeahead. Locale is part of the key because the API
 * returns a selected `lang` and locale-specific story permalinks.
 */
const caches = new Map<Lang, FeedResponse>();
const inflight = new Map<Lang, Promise<FeedResponse | null>>();

interface FreshnessCacheEntry {
  value: FeedFreshness;
  expiresAt: number;
}

/** `null` means unloaded; an entry with a null value is a valid empty result. */
let freshnessCache: FreshnessCacheEntry | null = null;
let freshnessInflight: Promise<number | null> | null = null;

function setFreshnessEntry(value: FeedFreshness): void {
  if (!isFeedFreshness(value)) return;
  // A feed-sourced value has no run summary; keep a still-valid one.
  const prior = validFreshnessEntry();
  const latestRun =
    value.latestRun !== undefined ? value.latestRun : prior?.value.latestRun;
  freshnessCache = {
    value: latestRun !== undefined ? { ...value, latestRun } : value,
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

export function feedApiUrl(lang: Lang): string {
  return withLang("/api/feed", lang);
}

export function getCachedFeed(lang: Lang): FeedResponse | null {
  return caches.get(lang) ?? null;
}

/** The footer only needs the newest published-item timestamp, not feed data. */
export function getCachedFeedFreshness(): number | null {
  return validFreshnessEntry()?.value.lastFetchedAt ?? null;
}

/** Newest run summary; `undefined` until the slim endpoint has answered. */
export function getCachedLatestRun(): LatestRunSummary | null | undefined {
  return validFreshnessEntry()?.value.latestRun;
}

/**
 * Fetch the slim endpoint once, sharing an in-flight request. Successful
 * values (including null) live for the client TTL; failures and malformed
 * responses are not cached, so the next call retries.
 */
export function fetchFeedFreshnessOnce(): Promise<number | null> {
  const cached = validFreshnessEntry();
  // A feed-sourced entry lacks the run summary; the slim endpoint has it.
  if (cached && cached.value.latestRun !== undefined)
    return Promise.resolve(cached.value.lastFetchedAt);
  if (freshnessInflight) return freshnessInflight;

  freshnessInflight = fetch("/api/feed/freshness")
    .then((res) => (res.ok ? res.json().catch(() => null) : null))
    .then((body) => {
      freshnessInflight = null;
      if (!isFeedFreshness(body)) return null;
      // The endpoint answered, so a missing summary means "none", not "unloaded".
      setFreshnessEntry({ ...body, latestRun: body.latestRun ?? null });
      return body.lastFetchedAt;
    })
    .catch(() => {
      freshnessInflight = null;
      return null;
    });
  return freshnessInflight;
}

/** Called by the homepage once it has its own unfiltered (no `q`) fetch. */
export function setCachedFeed(feed: FeedResponse, lang: Lang): void {
  caches.set(lang, feed);
  setFreshnessEntry({ lastFetchedAt: feed.lastFetchedAt });
  if (feed.learnedKeywords?.length) setLearnedKeywords(feed.learnedKeywords);
}

/** Fetches once per locale; concurrent callers share the same request. */
export function fetchFeedOnce(lang: Lang): Promise<FeedResponse | null> {
  const cached = caches.get(lang);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(lang);
  if (pending) return pending;

  const request = fetch(feedApiUrl(lang))
    .then((res) => (res.ok ? (res.json() as Promise<FeedResponse>) : null))
    .then((res) => {
      if (res) {
        caches.set(lang, res);
        setFreshnessEntry({ lastFetchedAt: res.lastFetchedAt });
      }
      return res;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(lang);
    });
  inflight.set(lang, request);
  return request;
}
