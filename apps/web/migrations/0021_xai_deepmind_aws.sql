-- xAI news via sitemap (no RSS) plus verified vendor RSS.
INSERT OR IGNORE INTO sources (id, name, type, config, enabled) VALUES
  ('xai', 'xAI News', 'xai', '{"homepage":"https://x.ai","sitemap":"https://x.ai/sitemap.xml"}', 1),
  ('deepmind', 'DeepMind Blog', 'rss', '{"feed":"https://deepmind.google/blog/rss.xml","homepage":"https://deepmind.google"}', 1),
  ('aws-ml', 'AWS ML Blog', 'rss', '{"feed":"https://aws.amazon.com/blogs/machine-learning/feed/","homepage":"https://aws.amazon.com/blogs/machine-learning/"}', 1),
  ('google-dev', 'Google Developers Blog', 'rss', '{"feed":"https://developers.googleblog.com/rss/","homepage":"https://developers.googleblog.com"}', 1);
