-- Public feed, day archive, public digest, and the hourly re-rank filter
-- status plus a published_at range. idx_items_published_at still visits
-- every status in that range, and idx_items_status cannot bound the time.
CREATE INDEX IF NOT EXISTS idx_items_status_published_at
  ON items (status, published_at DESC);

-- Every feed read takes MAX(fetched_at) for published rows. The status
-- index walks every published row; idx_items_fetched_at ignores status.
CREATE INDEX IF NOT EXISTS idx_items_status_fetched_at
  ON items (status, fetched_at DESC);

-- The re-rank groups merged rows by duplicate_of, and a merge looks up
-- one canonical. idx_items_status scans every merged row for both.
CREATE INDEX IF NOT EXISTS idx_items_status_duplicate_of
  ON items (status, duplicate_of);
