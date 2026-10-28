-- Serves every latest-run read (lastRun, the admin run list, the ingest
-- scheduler's open-run check, health streaks). They ORDER BY this exact
-- expression (WORKFLOW_RUN_STARTED_AT_ORDER_SQL) so legacy epoch-ms rows sort
-- with seconds rows. Without the index each read scanned and sorted the whole
-- table (~4.8k rows per read, ~500 reads a day). The expression text must stay
-- identical to the ORDER BY or SQLite will not use it.
CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_order
  ON workflow_runs (
    (CASE WHEN started_at > 1000000000000 THEN started_at / 1000 ELSE started_at END) DESC,
    id DESC
  );
