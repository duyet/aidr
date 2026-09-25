-- Independent EN↔VI translation semantic-review schema.
--
-- This is the complete translation-QA migration for #158.  Keep the
-- translation contract in one migration so #160 can add its independent
-- 0024 media migration and #161 can own 0025 for LLM run identity.  Runtime
-- code must verify this schema before it queries pending translations; it
-- must never infer that a missing table means an empty queue.

-- Source language is explicit metadata.  Legacy rows are conservatively
-- treated as English; operators must set Vietnamese explicitly rather than
-- relying on diacritics or a text heuristic.
ALTER TABLE items ADD COLUMN source_lang TEXT NOT NULL DEFAULT 'en'
  CHECK (source_lang IN ('en', 'vi'));
ALTER TABLE items ADD COLUMN source_revision INTEGER NOT NULL DEFAULT 0;

-- Current-candidate provenance is a small marker on the translation row.  The
-- append-only tables below retain the complete history.
ALTER TABLE translations ADD COLUMN qa_source_hash TEXT;
ALTER TABLE translations ADD COLUMN qa_candidate_hash TEXT;
ALTER TABLE translations ADD COLUMN qa_direction TEXT;
ALTER TABLE translations ADD COLUMN qa_reviewer_model TEXT;
ALTER TABLE translations ADD COLUMN qa_criteria_version TEXT;
ALTER TABLE translations ADD COLUMN qa_source_revision INTEGER;
ALTER TABLE translations ADD COLUMN source_lang TEXT NOT NULL DEFAULT 'en'
  CHECK (source_lang IN ('en', 'vi'));
ALTER TABLE translations ADD COLUMN target_lang TEXT NOT NULL DEFAULT 'vi'
  CHECK (target_lang IN ('en', 'vi'));

-- The old translation table only had a language key.  Preserve its meaning
-- while making the target explicit for all existing en/vi rows.
UPDATE translations SET target_lang = lang WHERE lang IN ('en', 'vi');

-- Initial audit table retained for compatibility with the first QA slice.  New
-- runtime writes use the richer immutable attempt table below; this table is
-- never updated or deleted by the Worker.
CREATE TABLE IF NOT EXISTS translation_reviews (
  item_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('en-vi', 'vi-en')),
  source_lang TEXT NOT NULL DEFAULT 'en' CHECK (source_lang IN ('en', 'vi')),
  target_lang TEXT NOT NULL DEFAULT 'vi' CHECK (target_lang IN ('en', 'vi')),
  source_revision INTEGER NOT NULL DEFAULT 0,
  source_hash TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (
    decision IN (
      'accepted', 'repaired', 'human_review', 'review_failed',
      'human_accepted', 'retry_requested'
    )
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

CREATE TRIGGER IF NOT EXISTS trg_translation_reviews_immutable_update
BEFORE UPDATE ON translation_reviews
BEGIN
  SELECT RAISE(ABORT, 'translation review history is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_translation_reviews_immutable_delete
BEFORE DELETE ON translation_reviews
BEGIN
  SELECT RAISE(ABORT, 'translation review history is immutable');
END;

-- Every logical review/repair/re-review result is append-only and idempotent.
-- The deterministic attempt id is supplied by the runtime; INSERT OR IGNORE
-- makes a retried batch safe without allowing a row to be rewritten.
CREATE TABLE IF NOT EXISTS translation_review_attempts (
  attempt_id TEXT PRIMARY KEY,
  state_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  source_lang TEXT NOT NULL CHECK (source_lang IN ('en', 'vi')),
  target_lang TEXT NOT NULL CHECK (target_lang IN ('en', 'vi')),
  direction TEXT NOT NULL CHECK (direction IN ('en-vi', 'vi-en')),
  source_hash TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  round INTEGER NOT NULL CHECK (round > 0),
  phase TEXT NOT NULL CHECK (phase IN ('initial', 'repair', 're_review', 'resolution')),
  criteria_fingerprint TEXT NOT NULL,
  prompt_fingerprint TEXT NOT NULL,
  policy_fingerprint TEXT NOT NULL,
  model_fingerprint TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (
    decision IN (
      'accepted', 'repaired', 'human_review', 'review_failed',
      'human_accepted', 'retry_requested'
    )
  ),
  fidelity REAL,
  naturalness REAL,
  confidence REAL,
  hard_failures TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL,
  reviewer_chain TEXT NOT NULL,
  reviewer_model TEXT,
  repair_model TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (
    item_id, lang, source_lang, target_lang, direction,
    source_hash, candidate_hash, attempt_number, round, phase,
    criteria_fingerprint, prompt_fingerprint, policy_fingerprint, model_fingerprint
  )
);

CREATE INDEX IF NOT EXISTS idx_translation_review_attempts_item
  ON translation_review_attempts (item_id, lang, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_translation_review_attempts_state
  ON translation_review_attempts (state_id, created_at ASC);

CREATE TRIGGER IF NOT EXISTS trg_translation_review_attempts_immutable_update
BEFORE UPDATE ON translation_review_attempts
BEGIN
  SELECT RAISE(ABORT, 'translation review attempts are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_translation_review_attempts_immutable_delete
BEFORE DELETE ON translation_review_attempts
BEGIN
  SELECT RAISE(ABORT, 'translation review attempts are immutable');
END;

-- Current state is the only mutable review row.  It is keyed by the exact
-- source/candidate pair and guarded by a lease plus source-revision CAS in
-- the Worker.  attempt_count is never reset by an operator retry, so a manual
-- retry cannot bypass the cross-run cap.
CREATE TABLE IF NOT EXISTS translation_review_state (
  state_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  source_lang TEXT NOT NULL CHECK (source_lang IN ('en', 'vi')),
  target_lang TEXT NOT NULL CHECK (target_lang IN ('en', 'vi')),
  direction TEXT NOT NULL CHECK (direction IN ('en-vi', 'vi-en')),
  source_hash TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  candidate_title TEXT NOT NULL,
  candidate_summary TEXT NOT NULL,
  criteria_fingerprint TEXT NOT NULL,
  prompt_fingerprint TEXT NOT NULL,
  policy_fingerprint TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (
    decision IN (
      'pending', 'accepted', 'repaired', 'human_review', 'review_failed',
      'human_accepted', 'retry_requested'
    )
  ),
  attempt_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  manual_retry_count INTEGER NOT NULL DEFAULT 0 CHECK (manual_retry_count >= 0),
  terminal INTEGER NOT NULL DEFAULT 0 CHECK (terminal IN (0, 1)),
  next_retry_at INTEGER,
  lease_token TEXT,
  lease_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (
    item_id, lang, source_lang, target_lang, direction,
    source_hash, candidate_hash,
    criteria_fingerprint, prompt_fingerprint, policy_fingerprint
  )
);

CREATE INDEX IF NOT EXISTS idx_translation_review_state_queue
  ON translation_review_state (terminal, decision, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_translation_review_state_retry
  ON translation_review_state (terminal, next_retry_at, attempt_count);

-- Human resolutions are an append-only audit trail.  The state row is updated
-- with a compare-and-set in the same D1 batch, but this record is never
-- rewritten or deleted.
CREATE TABLE IF NOT EXISTS translation_review_resolutions (
  resolution_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  state_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('accept_original', 'retry')),
  actor TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_translation_review_resolutions_item
  ON translation_review_resolutions (item_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_translation_review_resolutions_immutable_update
BEFORE UPDATE ON translation_review_resolutions
BEGIN
  SELECT RAISE(ABORT, 'translation review resolutions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_translation_review_resolutions_immutable_delete
BEFORE DELETE ON translation_review_resolutions
BEGIN
  SELECT RAISE(ABORT, 'translation review resolutions are immutable');
END;

-- A source edit invalidates every current direction, including a direction
-- that is not rewritten by the source writer.  The revision is monotonic and
-- the state reset prevents a stale terminal decision from being claimed.
CREATE TRIGGER IF NOT EXISTS trg_items_source_revision
AFTER UPDATE OF title, summary, source_lang ON items
WHEN OLD.title IS NOT NEW.title OR OLD.summary IS NOT NEW.summary OR OLD.source_lang IS NOT NEW.source_lang
BEGIN
  UPDATE items
     SET source_revision = source_revision + 1
   WHERE id = NEW.id;

  UPDATE translations
     SET qa_rating = NULL,
         qa_at = NULL,
         qa_source_hash = NULL,
         qa_candidate_hash = NULL,
         qa_source_revision = NULL,
         qa_direction = NULL,
         qa_reviewer_model = NULL,
         qa_criteria_version = NULL
   WHERE item_id = NEW.id;

  UPDATE translation_review_state
     SET decision = 'pending',
         terminal = 0,
         next_retry_at = NULL,
         lease_token = NULL,
         lease_until = NULL,
         updated_at = CAST(strftime('%s', 'now') AS INTEGER)
   WHERE item_id = NEW.id;
END;

-- A candidate rewrite is also an invalidation boundary.  The centralized
-- translation upsert clears marker columns.  The trigger also protects a
-- direct/future writer that changes text or language metadata while leaving
-- the old marker in place.  A completed review/repair is exempt only when it
-- deliberately replaces the marker with a new candidate hash.
CREATE TRIGGER IF NOT EXISTS trg_translations_candidate_invalidation
AFTER UPDATE OF title, summary, source_lang, target_lang ON translations
WHEN (OLD.title IS NOT NEW.title OR OLD.summary IS NOT NEW.summary OR OLD.source_lang IS NOT NEW.source_lang OR OLD.target_lang IS NOT NEW.target_lang)
     AND (
       NEW.qa_candidate_hash IS NULL
       OR NEW.qa_candidate_hash = OLD.qa_candidate_hash
     )
BEGIN
  UPDATE translation_review_state
     SET decision = 'pending',
         terminal = 0,
         next_retry_at = NULL,
         lease_token = NULL,
         lease_until = NULL,
         updated_at = CAST(strftime('%s', 'now') AS INTEGER)
   WHERE item_id = NEW.item_id AND lang = NEW.lang;
END;
