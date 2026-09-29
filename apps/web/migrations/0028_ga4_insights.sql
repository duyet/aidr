-- GA4 audience snapshot for the /data Audience tab.
--
-- The browser already reports page views to GA4, but the Worker cannot read
-- them back: GA4 is a separate service behind an authenticated Data API. So the
-- property is pulled server-side on a schedule (`worker/ga4/insights.ts`, gated
-- to once per 24h off the hourly ingest Durable Object alarm, plus the admin
-- `POST /api/admin/ga4-sync`) and stored here. The public read path then
-- serves one local row instead of calling Google on a page load.
--
-- One row, not a table of daily events. A `runReport` already returns 90 days
-- of daily rows in one call, so a single current snapshot is the whole
-- dataset; history is Google's, not ours. The primary key is the literal
-- `'current'` and the sync replaces it in place — a failed sync must leave the
-- last good numbers on screen rather than truncate them.
--
-- `payload` is JSON and is validated on read by `parseGa4Snapshot`, which
-- returns null (rendered as "Unavailable", never 0) unless the totals block is
-- intact. `property_id` is recorded so a snapshot can be traced to the
-- property it came from after the id is rotated in wrangler.toml.
CREATE TABLE IF NOT EXISTS ga4_insights (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  -- Epoch seconds of the sync that produced this payload.
  fetched_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);

-- The read path fetches by the literal id; the sync upserts on it.
CREATE INDEX IF NOT EXISTS idx_ga4_insights_fetched_at
  ON ga4_insights (fetched_at DESC);
