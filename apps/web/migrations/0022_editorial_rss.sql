-- Editorial + lab RSS verified live 2026-09-18 (all serving fresh items).
-- VentureBeat excluded (429s bot fetches); The Gradient excluded (stale since Feb).
INSERT OR IGNORE INTO sources (id, name, type, config, enabled) VALUES
  ('mit-tr-ai', 'MIT Tech Review AI', 'rss', '{"feed":"https://www.technologyreview.com/topic/artificial-intelligence/feed/","homepage":"https://www.technologyreview.com/topic/artificial-intelligence/"}', 1),
  ('marktechpost', 'MarkTechPost', 'rss', '{"feed":"https://www.marktechpost.com/feed/","homepage":"https://www.marktechpost.com/"}', 1),
  ('google-research', 'Google Research Blog', 'rss', '{"feed":"https://research.google/blog/rss/","homepage":"https://research.google/blog/"}', 1),
  ('simonwillison', 'Simon Willison', 'rss', '{"feed":"https://simonwillison.net/atom/everything/","homepage":"https://simonwillison.net/"}', 1),
  ('the-decoder', 'The Decoder', 'rss', '{"feed":"https://the-decoder.com/feed/","homepage":"https://the-decoder.com/"}', 1),
  ('mit-news-ai', 'MIT News AI', 'rss', '{"feed":"https://news.mit.edu/rss/topic/artificial-intelligence2","homepage":"https://news.mit.edu/"}', 1),
  ('lastweekin-ai', 'Last Week in AI', 'rss', '{"feed":"https://lastweekin.ai/feed","homepage":"https://lastweekin.ai/"}', 1);
