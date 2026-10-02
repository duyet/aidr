-- Wider HN search so model releases, new model kinds, and new AI labs
-- are in the newest-100 window. Mirrors HN_SCOPE_SOURCE in catalog.ts.
-- Upsert config only; an operator who disabled HN keeps it disabled.
INSERT INTO sources (id, name, type, config, enabled) VALUES
  ('hn', 'Hacker News', 'hn', '{"query":"AI OR LLM OR GPT OR Claude OR Gemini OR OpenAI OR Anthropic OR DeepSeek OR \"language model\" OR \"foundation model\" OR \"open weights\" OR \"AI lab\" OR \"world model\" OR \"video model\"","popularMinPoints":40}', 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  type = excluded.type,
  config = excluded.config;
