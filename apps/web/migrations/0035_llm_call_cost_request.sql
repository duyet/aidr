-- Per-attempt price and AnyRouter request id for llm_calls. Older rows stay NULL.
-- cost_usd: AnyRouter's `usage.cost` for the attempt (USD).
-- request_id: AnyRouter's X-Request-ID (else stream metadata), needed for
--   failure reports to AnyRouter.
ALTER TABLE llm_calls ADD COLUMN cost_usd REAL;
ALTER TABLE llm_calls ADD COLUMN request_id TEXT;
