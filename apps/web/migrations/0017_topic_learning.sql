CREATE TABLE IF NOT EXISTS topic_daily (
  day TEXT NOT NULL,
  topic TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, topic)
);

CREATE INDEX IF NOT EXISTS idx_topic_daily_day ON topic_daily (day);
CREATE INDEX IF NOT EXISTS idx_topic_daily_topic ON topic_daily (topic);

-- Self-learned entity/model keywords promoted from recurring scored tags.
CREATE TABLE IF NOT EXISTS learned_keywords (
  keyword TEXT PRIMARY KEY,
  source_topic TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_learned_keywords_status
  ON learned_keywords (status, hit_count DESC);

-- Wider HN Algolia query for newer models / tools / infra.
UPDATE sources
SET config = '{"query":"AI OR LLM OR GPT OR Claude OR Gemini OR OpenAI OR Anthropic OR DeepSeek OR Qwen OR Mistral OR Llama OR Grok OR Cursor OR Copilot OR Nvidia OR HuggingFace OR ollama OR vLLM OR MCP OR agentic OR OpenRouter"}'
WHERE id = 'hn';

INSERT OR IGNORE INTO sources (id, name, type, config, enabled) VALUES
  ('lobsters', 'Lobsters', 'lobsters', '{"tags":["ai","ml","vibecoding"]}', 1);
