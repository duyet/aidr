-- Cloudflare Blog, AI posts only. Mirrors CLOUDFLARE_BLOG_SOURCE in
-- apps/web/worker/sources/catalog.ts (a test asserts they agree).
--
-- The blog is mostly non-AI, so the shared AI keyword filter and maxItems
-- gate it before scoring.
--
-- Upsert on name/type/config, never enabled: an operator who switched the
-- source off keeps it off.
INSERT INTO sources (id, name, type, config, enabled) VALUES
  ('cloudflare-blog', 'Cloudflare Blog', 'rss', '{"feed":"https://blog.cloudflare.com/rss/","homepage":"https://blog.cloudflare.com","keywordFilter":"ai","maxItems":5}', 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  type = excluded.type,
  config = excluded.config;
