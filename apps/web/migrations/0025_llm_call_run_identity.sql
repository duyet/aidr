-- Give every new LLM attempt an authoritative operation/run identity and
-- structured, non-sensitive error fields. Existing rows remain NULL and are
-- intentionally not backfilled by timestamp guessing.
ALTER TABLE llm_calls ADD COLUMN run_id TEXT;
ALTER TABLE llm_calls ADD COLUMN error_code TEXT;
ALTER TABLE llm_calls ADD COLUMN error_status INTEGER;

CREATE INDEX IF NOT EXISTS idx_llm_calls_run_id_ts ON llm_calls(run_id, ts);
