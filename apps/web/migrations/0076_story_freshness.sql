-- Shadow-mode freshness + trending verdicts for top stories (see
-- ALGORITHM.md "Freshness check"). One row per item, replaced on each
-- re-check; nothing in ranking, the TL;DR or notify reads it yet.
CREATE TABLE IF NOT EXISTS story_freshness (
  item_id TEXT PRIMARY KEY,
  checked_at INTEGER NOT NULL,
  run_id TEXT,
  verdict TEXT NOT NULL,
  trending_sources INTEGER NOT NULL,
  domains_json TEXT NOT NULL,
  article_published_at INTEGER,
  newer_urls_json TEXT NOT NULL,
  evidence_urls_json TEXT NOT NULL,
  providers TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  errors_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_story_freshness_checked
  ON story_freshness (checked_at);
