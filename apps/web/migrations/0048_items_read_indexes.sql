-- 1. Feed, day archive, /api/public, news sitemap's getFeed,
--    day-archive prev/next, rank window, re-rank outer query, day card.
--    Serves: WHERE status = 'published' AND published_at >= ? AND published_at < ?
--    and ORDER BY published_at DESC, and MAX/MIN(published_at) under that status.
CREATE INDEX IF NOT EXISTS idx_items_status_published_at
  ON items (status, published_at DESC);

-- 2. MAX(fetched_at) WHERE status = 'published'
--    (getFeed batch and GET /api/feed/freshness, GET /api/health).
--    Does not replace idx_items_fetched_at, which still serves
--    fetched_at range scans that have no status predicate.
CREATE INDEX IF NOT EXISTS idx_items_status_fetched_at
  ON items (status, fetched_at DESC);

-- 3. Ranking join only. Partial so published re-rank updates do not maintain it.
--    Serves ranking.ts RANK_SIGNAL_JOIN:
--    SELECT duplicate_of, json_group_array(json_array(source_id, points, comments, url))
--    FROM items WHERE status = 'merged' GROUP BY duplicate_of
CREATE INDEX IF NOT EXISTS idx_items_merged_members
  ON items (duplicate_of, source_id, points, comments, url)
  WHERE status = 'merged';
