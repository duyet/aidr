-- One row per item whose stored VI translation backfill re-checked and sent
-- back to the model (#1021). A row is re-translated at most once, so a row
-- the model cannot fix does not take the recheck slot every run.
CREATE TABLE IF NOT EXISTS translation_rechecks (
  item_id TEXT PRIMARY KEY,
  attempted_at INTEGER NOT NULL
);
