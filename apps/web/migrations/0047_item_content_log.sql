-- History of title and summary edits. A row is written only when the stored
-- text actually changes (ingest, backfill, suggestion, admin, correction).
-- The story page reads the latest rows; the pipeline catalog counts them.
CREATE TABLE IF NOT EXISTS item_content_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  field TEXT NOT NULL,
  before_text TEXT,
  after_text TEXT,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_item_content_log_item
  ON item_content_log (item_id, created_at DESC);
