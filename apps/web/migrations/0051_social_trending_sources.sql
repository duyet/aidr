-- Add the social-trending proxies (Reddit AI subreddits' hot feed and
-- Techmeme) and disable vnexpress-tech. Mirrors REGISTRY_0051 in
-- apps/web/worker/sources/catalog.ts (a test asserts they agree); why X is
-- not a source and why these are the stand-ins is written there.
--
-- Upsert on name/type/config, never enabled: an operator who switched a
-- source off keeps it off.
INSERT INTO sources (id, name, type, config, enabled) VALUES
  ('reddit-ml', 'r/MachineLearning', 'rss', '{"feed":"https://www.reddit.com/r/MachineLearning/hot/.rss","homepage":"https://www.reddit.com/r/MachineLearning/","minRequestIntervalMs":3000,"maxItems":6}', 1),
  ('reddit-localllama', 'r/LocalLLaMA', 'rss', '{"feed":"https://www.reddit.com/r/LocalLLaMA/hot/.rss","homepage":"https://www.reddit.com/r/LocalLLaMA/","minRequestIntervalMs":3000,"maxItems":4}', 1),
  ('reddit-singularity', 'r/singularity', 'rss', '{"feed":"https://www.reddit.com/r/singularity/hot/.rss","homepage":"https://www.reddit.com/r/singularity/","keywordFilter":"ai","minRequestIntervalMs":3000,"maxItems":4}', 1),
  ('techmeme', 'Techmeme', 'rss', '{"feed":"https://www.techmeme.com/feed.xml","homepage":"https://www.techmeme.com/","keywordFilter":"ai","maxItems":6}', 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  type = excluded.type,
  config = excluded.config;

-- vnexpress-tech off: the only sourceLang: "vi" row, so the VI→EN translate
-- path idles until another vi source joins. One statement, not a row upsert,
-- because enabled is operator-owned.
UPDATE sources SET enabled = 0 WHERE id = 'vnexpress-tech';
