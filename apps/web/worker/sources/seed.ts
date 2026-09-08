/** Mirrors migrations/0018_vendor_blogs.sql so ingest can seed before
 * `wrangler d1 migrations apply`. */
export const VENDOR_BLOG_SEED_SQL = `
INSERT OR IGNORE INTO sources (id, name, type, config, enabled) VALUES
  ('openai', 'OpenAI News', 'rss', '{"feed":"https://openai.com/news/rss.xml","homepage":"https://openai.com"}', 1),
  ('anthropic', 'Anthropic News', 'anthropic', '{"homepage":"https://www.anthropic.com"}', 1),
  ('google-ai', 'Google AI Blog', 'rss', '{"feed":"https://blog.google/technology/ai/rss/","homepage":"https://blog.google"}', 1),
  ('hf-blog', 'Hugging Face Blog', 'rss', '{"feed":"https://huggingface.co/blog/feed.xml","homepage":"https://huggingface.co"}', 1)
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
