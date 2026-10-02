-- Instant review of reader suggestions (reviewed on submit, hourly step is
-- the safety net) and the owner-only contributions history.
-- applied_text: the text the reviewer actually wrote (may differ from the
--   reader's suggestion when the reviewer adjusted it).
-- reviewed_at: when the verdict landed.
-- review_started_at: claim time; a 'reviewing' row older than the stale
--   window is picked up again by the hourly step.
-- review_run_id: the llm_calls run id the review was logged under.
ALTER TABLE translation_suggestions ADD COLUMN applied_text TEXT;
ALTER TABLE translation_suggestions ADD COLUMN reviewed_at INTEGER;
ALTER TABLE translation_suggestions ADD COLUMN review_started_at INTEGER;
ALTER TABLE translation_suggestions ADD COLUMN review_run_id TEXT;

CREATE INDEX IF NOT EXISTS idx_suggestions_user_created
  ON translation_suggestions (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_user_created
  ON submissions (user_id, created_at);
