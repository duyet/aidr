-- Official lab blogs: generic RSS plus Anthropic newsroom HTML (no RSS).
INSERT OR IGNORE INTO sources (id, name, type, config, enabled) VALUES
  ('openai', 'OpenAI News', 'rss', '{"feed":"https://openai.com/news/rss.xml","homepage":"https://openai.com"}', 1),
  ('anthropic', 'Anthropic News', 'anthropic', '{"homepage":"https://www.anthropic.com"}', 1),
  ('google-ai', 'Google AI Blog', 'rss', '{"feed":"https://blog.google/technology/ai/rss/","homepage":"https://blog.google"}', 1),
  ('hf-blog', 'Hugging Face Blog', 'rss', '{"feed":"https://huggingface.co/blog/feed.xml","homepage":"https://huggingface.co"}', 1);
