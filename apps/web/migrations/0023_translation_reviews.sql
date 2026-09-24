-- Independent translation semantic-review provenance. Candidate writers
-- clear the translations.qa_* marker columns; the append-shaped review table
-- keeps the prior decisions auditable.

ALTER TABLE translations ADD COLUMN qa_source_hash TEXT;
ALTER TABLE translations ADD COLUMN qa_candidate_hash TEXT;
ALTER TABLE translations ADD COLUMN qa_direction TEXT;
ALTER TABLE translations ADD COLUMN qa_reviewer_model TEXT;
ALTER TABLE translations ADD COLUMN qa_criteria_version TEXT;

CREATE TABLE IF NOT EXISTS translation_reviews (
  item_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('en-vi', 'vi-en')),
  source_hash TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (
    decision IN ('accepted', 'repaired', 'human_review', 'review_failed')
  ),
  fidelity REAL,
  naturalness REAL,
  confidence REAL,
  hard_failures TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL,
  reviewer_chain TEXT NOT NULL,
  reviewer_model TEXT,
  repair_model TEXT,
  criteria_version TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, lang, direction, source_hash, candidate_hash)
);

CREATE INDEX IF NOT EXISTS idx_translation_reviews_item_updated
  ON translation_reviews (item_id, lang, updated_at DESC);
