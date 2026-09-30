-- JEV review panel audit trail (#144).
--
-- One row per panel run on one subject. Written only when the panel is
-- enabled (JEV_PANEL_ENABLED); with the panel off this table stays empty.
-- A replayed workflow step reuses the memoized result and writes nothing, and
-- the UNIQUE key makes a duplicate write a no-op (INSERT OR IGNORE).
--
-- Raw subject text is never stored. `votes_json` holds per-judge records
-- (role, configured and served model, status, vote, score, claims, latency,
-- tokens) produced by the core audit.
--
-- The override_* columns are the human override. They record an operator's
-- decision on the verdict; they do not re-score or re-publish the item.
CREATE TABLE IF NOT EXISTS jev_panel_verdicts (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('score', 'translation')),
  subject_id TEXT NOT NULL,
  panel_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  outcome_kind TEXT NOT NULL,
  outcome_reason TEXT NOT NULL,
  quorum_reached INTEGER NOT NULL CHECK (quorum_reached IN (0, 1)),
  relevance_before REAL,
  relevance_after REAL,
  category TEXT,
  debate_triggered INTEGER NOT NULL DEFAULT 0 CHECK (debate_triggered IN (0, 1)),
  judge_calls INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  votes_json TEXT NOT NULL,
  override_decision TEXT CHECK (override_decision IN ('uphold', 'overturn')),
  override_note TEXT,
  override_actor TEXT,
  override_at INTEGER,
  UNIQUE (run_id, subject_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_jev_panel_verdicts_created
  ON jev_panel_verdicts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jev_panel_verdicts_subject
  ON jev_panel_verdicts (subject_id, created_at DESC);
