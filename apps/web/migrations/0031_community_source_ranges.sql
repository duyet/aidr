-- Wider Lobsters tags and an HN popularity range (#230). Added after 0027
-- was applied, so it is its own migration; the rows mirror REGISTRY_0031 in
-- apps/web/worker/sources/catalog.ts (a test asserts they agree).
--
-- lobsters: adds filteredTags (programming, compsci, devops, security), each
-- verified live on lobste.rs. Stories from those tags are kept only when the
-- title matches the shared AI keyword list.
-- hn: adds popularMinPoints, a third Algolia search for stories scoring at
-- least that much in the window. Same AI keyword filter.
--
-- Upsert on name/type/config, never enabled: an operator who switched a
-- source off keeps it off.
INSERT INTO sources (id, name, type, config, enabled) VALUES
  ('hn', 'Hacker News', 'hn', '{"query":"AI OR LLM OR GPT OR Claude OR Gemini OR OpenAI OR Anthropic OR DeepSeek","popularMinPoints":40}', 1),
  ('lobsters', 'Lobsters', 'lobsters', '{"tags":["ai","ml","vibecoding"],"filteredTags":["programming","compsci","devops","security"]}', 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  type = excluded.type,
  config = excluded.config;
