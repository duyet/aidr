-- Cap the MarketBrief and HuggingNews aggregators at 6 items per run and add
-- AI labs, vendors and newsletters. Mirrors REGISTRY_0044 in
-- apps/web/worker/sources/catalog.ts (a test asserts they agree); the reasons
-- and the feeds that were checked and left out are written there.
--
-- Upsert on name/type/config, never enabled: an operator who switched a
-- source off keeps it off.
INSERT INTO sources (id, name, type, config, enabled) VALUES
  ('huggingnews', 'HuggingNews', 'huggingnews', '{"maxItems":6}', 1),
  ('marketbrief', 'MarketBrief', 'marketbrief', '{"homepage":"https://marketbrief.now","topics":["ai"],"maxItems":6}', 1),
  ('mistral', 'Mistral AI', 'rss', '{"feed":"https://mistral.ai/news/rss","homepage":"https://mistral.ai/news","maxItems":4}', 1),
  ('nvidia-blog', 'NVIDIA Blog', 'rss', '{"feed":"https://blogs.nvidia.com/feed/","homepage":"https://blogs.nvidia.com","keywordFilter":"ai","maxItems":4}', 1),
  ('nvidia-dev', 'NVIDIA Developer Blog', 'rss', '{"feed":"https://developer.nvidia.com/blog/feed/","homepage":"https://developer.nvidia.com/blog","keywordFilter":"ai","maxItems":4}', 1),
  ('microsoft-research', 'Microsoft Research', 'rss', '{"feed":"https://www.microsoft.com/en-us/research/feed/","homepage":"https://www.microsoft.com/en-us/research/blog/","keywordFilter":"ai","maxItems":3}', 1),
  ('apple-ml', 'Apple Machine Learning Research', 'rss', '{"feed":"https://machinelearning.apple.com/rss.xml","homepage":"https://machinelearning.apple.com","maxItems":3}', 1),
  ('together-ai', 'Together AI', 'rss', '{"feed":"https://www.together.ai/blog/rss.xml","homepage":"https://www.together.ai/blog","maxItems":3}', 1),
  ('github-ai', 'GitHub Blog AI & ML', 'rss', '{"feed":"https://github.blog/ai-and-ml/feed/","homepage":"https://github.blog/ai-and-ml/","maxItems":3}', 1),
  ('latent-space', 'Latent Space', 'rss', '{"feed":"https://www.latent.space/feed","homepage":"https://www.latent.space","maxItems":3}', 1),
  ('interconnects', 'Interconnects', 'rss', '{"feed":"https://www.interconnects.ai/feed","homepage":"https://www.interconnects.ai","maxItems":3}', 1),
  ('import-ai', 'Import AI', 'rss', '{"feed":"https://importai.substack.com/feed","homepage":"https://importai.substack.com","maxItems":2}', 1),
  ('bens-bites', 'Ben''s Bites', 'rss', '{"feed":"https://www.bensbites.com/feed","homepage":"https://www.bensbites.com","maxItems":3}', 1),
  ('ahead-of-ai', 'Ahead of AI', 'rss', '{"feed":"https://magazine.sebastianraschka.com/feed","homepage":"https://magazine.sebastianraschka.com","maxItems":2}', 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  type = excluded.type,
  config = excluded.config;
