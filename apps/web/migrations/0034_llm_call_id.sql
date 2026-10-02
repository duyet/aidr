-- Groups the attempts of one callAnyrouter / callSystemOne invocation, so a
-- fallback chain (404 → 429 → served) reads as one call. Older rows stay NULL.
ALTER TABLE llm_calls ADD COLUMN call_id TEXT;
