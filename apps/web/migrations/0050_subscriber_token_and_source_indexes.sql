-- 1. Confirm, unsubscribe, and preference updates filter
--    subscribers.unsubscribe_token (worker/subscribe/handlers.ts).
--    Unique because each subscriber row has its own token.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token
  ON subscribers (unsubscribe_token);

-- 2. Public sources rollup joins items.source_id and takes MAX(published_at)
--    (src/lib/system-queries.ts). The existing source_id index is partial
--    (WHERE status = 'merged', 0048) and does not serve this join.
CREATE INDEX IF NOT EXISTS idx_items_source_published
  ON items (source_id, published_at);
