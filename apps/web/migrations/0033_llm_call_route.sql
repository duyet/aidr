-- What actually served each LLM attempt: the requested id (a preset or
-- router alias such as @preset/aidr or anyrouter/free) followed by the
-- model(s) it resolved to, as a JSON array, plus the upstream provider.
-- Older rows stay NULL.
ALTER TABLE llm_calls ADD COLUMN route TEXT;
ALTER TABLE llm_calls ADD COLUMN provider TEXT;
