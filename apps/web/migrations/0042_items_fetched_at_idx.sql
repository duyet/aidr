-- Run details list the items first stored during a workflow run by
-- fetched_at. That column is written only on insert.
CREATE INDEX IF NOT EXISTS idx_items_fetched_at ON items (fetched_at);
