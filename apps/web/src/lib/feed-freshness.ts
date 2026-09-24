import type { DbReader } from "./db";

/** Keep this query identical to the feed's freshness field. */
export const LAST_FETCHED_AT_SQL =
  "SELECT MAX(fetched_at) AS last FROM items WHERE status = 'published'";

export const FEED_FRESHNESS_CACHE_CONTROL =
  "public, max-age=60, s-maxage=120, stale-while-revalidate=300";

export interface FeedFreshness {
  /** Epoch seconds of the newest fetched published item. */
  lastFetchedAt: number | null;
}

export async function getFeedFreshness(db: DbReader): Promise<FeedFreshness> {
  const row = await db
    .prepare(LAST_FETCHED_AT_SQL)
    .first<{ last: number | null }>();
  return { lastFetchedAt: row?.last ?? null };
}

export function feedFreshnessResponse(freshness: FeedFreshness): Response {
  return Response.json(freshness, {
    headers: { "Cache-Control": FEED_FRESHNESS_CACHE_CONTROL },
  });
}
