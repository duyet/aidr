/**
 * Lifetimes shared by the Worker cache (`edge-cache.ts`) and its KV tier
 * (`global-html-cache.ts`), so a copy expires at the same age in both.
 */

/**
 * A dormant colo must never serve content older than this. Ingest publishes
 * every 30 minutes, so 1h keeps a stale homepage or Telegram "full day" link
 * within about two editions of the live one.
 */
export const EDGE_CACHE_STALE_S = 3600;
/**
 * Cap on the fresh window, whatever `s-maxage` a page declares: a settled day
 * archive says a day, and Worker fresh + stale + CDN lifetime must stay under
 * `ASSET_RETENTION_MS` (html-cache.test.ts) or the HTML outlives its chunks.
 */
export const EDGE_CACHE_FRESH_MAX_S = 3600;
