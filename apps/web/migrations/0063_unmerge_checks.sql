-- Model same-story verdicts for `unmerge --dangling` (#797). One row per
-- restore candidate story. `story` is its row ids, sorted and comma-joined.
-- POST /api/admin/unmerge/check calls the model and writes these rows;
-- the unmerge planner only reads them, so a dry run and an apply never call
-- a model. `version` names the prompt and gate (CHECK_VERSION in
-- worker/unmerge/check.ts). `matches` is a JSON array of the published
-- stories the cluster gate kept a link to; `dropped` holds the links it
-- removed; `sent` holds the ids of the live rows the story was judged
-- against. `model` is null when no live row shared evidence with the story,
-- so no call was needed. `operation_id` is the check's `llm_calls.run_id`.
CREATE TABLE IF NOT EXISTS unmerge_checks (
  story TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('clear', 'match')),
  matches TEXT NOT NULL,
  dropped TEXT NOT NULL,
  sent TEXT NOT NULL,
  model TEXT,
  operation_id TEXT NOT NULL,
  checked_at INTEGER NOT NULL
);
