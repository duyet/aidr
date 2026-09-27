-- GENERATED FILE (0027_source_registry.sql) — DO NOT EDIT BY HAND.
-- Regenerate with: pnpm --filter @aidr/web run gen:source-migration
--
-- Source of truth: apps/web/worker/sources/catalog.ts (SOURCE_REGISTRY).
-- The same list produces the runtime seed in worker/sources/seed.ts, so the
-- migration and the pre-migration seed can no longer disagree.
-- Declarative source registry (#230). This file is GENERATED from
-- apps/web/worker/sources/catalog.ts — the same list that produces the
-- pre-migration runtime seed in worker/sources/seed.ts, so ingest can still
-- seed before wrangler d1 migrations apply and the two can no longer
-- disagree (a test asserts it).
-- 
-- Adds the Vietnamese-native source (the source_lang metadata lives in the
-- row config, not in this column) and four AI newsrooms.
-- 
-- Evaluated and NOT added, with the reasons recorded in the catalog:
--   arXiv          export.arxiv.org/robots.txt is Disallow-all and
--                  arxiv.org/robots.txt lists Disallow: /api, so the sortable
--                  Atom API is out; the one allowed surface (rss.arxiv.org,
--                  no robots.txt) was serving an empty channel because it
--                  declares skipDays for Sat/Sun, so it could not be
--                  verified live.
--   VentureBeat    429 on bot fetches (already noted in 0022).
--   Engadget       HTTP 202 challenge instead of the feed.
--   ZDNet          its 'AI topic' RSS redirects to general tech news.
--   Tuoi Tre cong-nghe  pubDate carries no timezone, so every item would
--                  land ~7h in the future and sort above fresh stories.
--   cafebiz.vn / techrum.vn / zingnews.vn   404 / 404 / 403.
-- 
-- This is INSERT OR IGNORE with no conflict clause: it only ever creates a
-- row that does not exist yet. The runtime seed's upsert is the thing that
-- keeps an existing row's name/type/config current, and it deliberately does
-- not touch the enabled flag, so an operator who switched a source off keeps
-- it off across every deploy.
--
INSERT OR IGNORE INTO sources (id, name, type, config, enabled) VALUES
  ('hn', 'Hacker News', 'hn', '{"query":"AI OR LLM OR GPT OR Claude OR Gemini OR OpenAI OR Anthropic OR DeepSeek"}', 1),
  ('huggingnews', 'HuggingNews', 'huggingnews', '{}', 1),
  ('lobsters', 'Lobsters', 'lobsters', '{"tags":["ai","ml","vibecoding"]}', 1),
  ('openai', 'OpenAI News', 'rss', '{"feed":"https://openai.com/news/rss.xml","homepage":"https://openai.com"}', 1),
  ('anthropic', 'Anthropic News', 'anthropic', '{"homepage":"https://www.anthropic.com"}', 1),
  ('google-ai', 'Google AI Blog', 'rss', '{"feed":"https://blog.google/technology/ai/rss/","homepage":"https://blog.google"}', 1),
  ('hf-blog', 'Hugging Face Blog', 'rss', '{"feed":"https://huggingface.co/blog/feed.xml","homepage":"https://huggingface.co"}', 1),
  ('marketbrief', 'MarketBrief', 'marketbrief', '{"homepage":"https://marketbrief.now","topics":["ai"]}', 1),
  ('xai', 'xAI News', 'xai', '{"homepage":"https://x.ai","sitemap":"https://x.ai/sitemap.xml"}', 1),
  ('deepmind', 'DeepMind Blog', 'rss', '{"feed":"https://deepmind.google/blog/rss.xml","homepage":"https://deepmind.google"}', 1),
  ('aws-ml', 'AWS ML Blog', 'rss', '{"feed":"https://aws.amazon.com/blogs/machine-learning/feed/","homepage":"https://aws.amazon.com/blogs/machine-learning/"}', 1),
  ('google-dev', 'Google Developers Blog', 'rss', '{"feed":"https://developers.googleblog.com/rss/","homepage":"https://developers.googleblog.com"}', 1),
  ('mit-tr-ai', 'MIT Tech Review AI', 'rss', '{"feed":"https://www.technologyreview.com/topic/artificial-intelligence/feed/","homepage":"https://www.technologyreview.com/topic/artificial-intelligence/"}', 1),
  ('marktechpost', 'MarkTechPost', 'rss', '{"feed":"https://www.marktechpost.com/feed/","homepage":"https://www.marktechpost.com/"}', 1),
  ('google-research', 'Google Research Blog', 'rss', '{"feed":"https://research.google/blog/rss/","homepage":"https://research.google/blog/"}', 1),
  ('simonwillison', 'Simon Willison', 'rss', '{"feed":"https://simonwillison.net/atom/everything/","homepage":"https://simonwillison.net/"}', 1),
  ('the-decoder', 'The Decoder', 'rss', '{"feed":"https://the-decoder.com/feed/","homepage":"https://the-decoder.com/"}', 1),
  ('mit-news-ai', 'MIT News AI', 'rss', '{"feed":"https://news.mit.edu/rss/topic/artificial-intelligence2","homepage":"https://news.mit.edu/"}', 1),
  ('lastweekin-ai', 'Last Week in AI', 'rss', '{"feed":"https://lastweekin.ai/feed","homepage":"https://lastweekin.ai/"}', 1),
  ('vnexpress-tech', 'VnExpress Khoa học & Công nghệ', 'rss', '{"feed":"https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss","homepage":"https://vnexpress.net/khoa-hoc-cong-nghe","sourceLang":"vi","maxItems":6}', 1),
  ('techcrunch-ai', 'TechCrunch AI', 'rss', '{"feed":"https://techcrunch.com/category/artificial-intelligence/feed/","homepage":"https://techcrunch.com/category/artificial-intelligence/","maxItems":6}', 1),
  ('theverge-ai', 'The Verge AI', 'rss', '{"feed":"https://www.theverge.com/rss/ai-artificial-intelligence/index.xml","homepage":"https://www.theverge.com/ai-artificial-intelligence","maxItems":6}', 1),
  ('arstechnica-ai', 'Ars Technica AI', 'rss', '{"feed":"https://arstechnica.com/ai/feed/","homepage":"https://arstechnica.com/ai/","maxItems":6}', 1),
  ('wired-ai', 'WIRED AI', 'rss', '{"feed":"https://www.wired.com/feed/tag/ai/latest/rss","homepage":"https://www.wired.com/tag/artificial-intelligence/","maxItems":6}', 1);
