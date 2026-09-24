-- Explicit source/target language metadata, source-revision compare-and-set,
-- immutable review attempts, leased current state, and human resolutions.
-- Migration 0023 remains the first QA schema; PR #160's 0024 media migration
-- must be applied between them without changing translation bind ordering.

ALTER TABLE items ADD COLUMN source_lang TEXT NOT NULL DEFAULT 'en'
  CHECK (source_lang IN ('en', 'vi'));
ALTER TABLE items ADD COLUMN source_revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE translations ADD COLUMN source_lang TEXT NOT NULL DEFAULT 'en'
  CHECK (source_lang IN ('en', 'vi'));
ALTER TABLE translations ADD COLUMN target_lang TEXT NOT NULL DEFAULT 'vi'
  CHECK (target_lang IN ('en', 'vi'));
ALTER TABLE translations ADD COLUMN qa_source_revision INTEGER;
UPDATE translations SET target_lang = lang WHERE lang IN ('en', 'vi');

ALTER TABLE translation_reviews ADD COLUMN source_lang TEXT NOT NULL DEFAULT 'en'
  CHECK (source_lang IN ('en', 'vi'));
ALTER TABLE translation_reviews ADD COLUMN target_lang TEXT NOT NULL DEFAULT 'vi'
  CHECK (target_lang IN ('en', 'vi'));
ALTER TABLE translation_reviews ADD COLUMN source_revision INTEGER NOT NULL DEFAULT 0;

-- Legacy 0023 rows are retained for audit, but new runtime writes use the
-- immutable attempt table below. No UPDATE or DELETE is issued against it.
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
  attempt_number INTEGER NOT NULL,
  round INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('initial', 'repair', 're_review', 'resolution')),
  criteria_fingerprint TEXT NOT NULL,
  prompt_fingerprint TEXT NOT NULL,
  policy_fingerprint TEXT NOT NULL,
  model_fingerprint TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (
    decision IN ('accepted', 'repaired', 'human_review', 'review_failed', 'human_accepted', 'retry_requested')
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
  decision TEXT NOT NULL DEFAULT 'pending',
  attempt_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  terminal INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  lease_token TEXT,
  lease_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (item_id, lang, source_lang, target_lang, direction, source_hash, candidate_hash)
);

CREATE INDEX IF NOT EXISTS idx_translation_review_state_queue
  ON translation_review_state (terminal, decision, updated_at DESC);

CREATE TABLE IF NOT EXISTS translation_review_resolutions (
  resolution_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  state_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
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

-- Any source title/summary/language write gets a monotonic revision, even when the
-- writer does not produce a translation. The trigger also invalidates every
-- current candidate marker, so no writer can leave a stale accepted review.
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
