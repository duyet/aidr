/** Mirrors migrations/0018_vendor_blogs.sql, 0020_marketbrief.sql, and
 * 0021_xai_deepmind_aws.sql so ingest can seed before
 * `wrangler d1 migrations apply`. */
export const VENDOR_BLOG_SEED_SQL = `
INSERT OR IGNORE INTO sources (id, name, type, config, enabled) VALUES
  ('openai', 'OpenAI News', 'rss', '{"feed":"https://openai.com/news/rss.xml","homepage":"https://openai.com"}', 1),
  ('anthropic', 'Anthropic News', 'anthropic', '{"homepage":"https://www.anthropic.com"}', 1),
  ('google-ai', 'Google AI Blog', 'rss', '{"feed":"https://blog.google/technology/ai/rss/","homepage":"https://blog.google"}', 1),
  ('hf-blog', 'Hugging Face Blog', 'rss', '{"feed":"https://huggingface.co/blog/feed.xml","homepage":"https://huggingface.co"}', 1),
  ('marketbrief', 'MarketBrief', 'marketbrief', '{"homepage":"https://marketbrief.now","topics":["ai"]}', 1),
  ('xai', 'xAI News', 'xai', '{"homepage":"https://x.ai","sitemap":"https://x.ai/sitemap.xml"}', 1),
  ('deepmind', 'DeepMind Blog', 'rss', '{"feed":"https://deepmind.google/blog/rss.xml","homepage":"https://deepmind.google"}', 1),
  ('aws-ml', 'AWS ML Blog', 'rss', '{"feed":"https://aws.amazon.com/blogs/machine-learning/feed/","homepage":"https://aws.amazon.com/blogs/machine-learning/"}', 1),
  ('google-dev', 'Google Developers Blog', 'rss', '{"feed":"https://developers.googleblog.com/rss/","homepage":"https://developers.googleblog.com"}', 1)
`;

let seeded = false;

export async function ensureVendorBlogSources(db: D1Database): Promise<void> {
  if (seeded) return;
  await db.prepare(VENDOR_BLOG_SEED_SQL.trim()).run();
  seeded = true;
}

/** Test helper — Worker isolate is long-lived; tests share the module. */
export function resetVendorBlogSeedCache(): void {
  seeded = false;
}
