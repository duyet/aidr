import type { DbReader } from "./db";

/**
 * This pilot defines freshness as the newest item-level `fetched_at` value
 * among published rows. It is the timestamp assigned when that item is first
 * persisted; it is not a workflow-completion or "latest successful run" time.
 * The existing feed field uses the same value and shape.
 */
export const NEWEST_PUBLISHED_FETCHED_AT_SQL =
  "SELECT MAX(fetched_at) AS last FROM items WHERE status = 'published'";

/** Browser cache is 60s; Cloudflare edge cache is 120s. No SWR directive. */
export const FEED_FRESHNESS_CACHE_CONTROL = "public, max-age=60, s-maxage=120";
export const FEED_FRESHNESS_ERROR_CACHE_CONTROL = "no-store";

/** Keep the client from pinning a value beyond the browser response TTL. */
export const FEED_FRESHNESS_CLIENT_TTL_MS = 60_000;

export interface FeedFreshness {
  /** Epoch seconds of the newest published item's initial fetch timestamp. */
  lastFetchedAt: number | null;
}

export function isFeedFreshness(value: unknown): value is FeedFreshness {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (!Object.hasOwn(value, "lastFetchedAt")) {
    return false;
  }
  const lastFetchedAt = (value as { lastFetchedAt?: unknown }).lastFetchedAt;
  return (
    lastFetchedAt === null ||
    (typeof lastFetchedAt === "number" &&
      Number.isInteger(lastFetchedAt) &&
      lastFetchedAt >= 0)
  );
}

export async function getFeedFreshness(db: DbReader): Promise<FeedFreshness> {
  const row = await db
    .prepare(NEWEST_PUBLISHED_FETCHED_AT_SQL)
    .first<{ last: number | null }>();
  return { lastFetchedAt: row?.last ?? null };
}

export function feedFreshnessResponse(freshness: FeedFreshness): Response {
  return Response.json(freshness, {
    headers: { "Cache-Control": FEED_FRESHNESS_CACHE_CONTROL },
  });
}
