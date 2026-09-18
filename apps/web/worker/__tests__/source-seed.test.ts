import { describe, expect, it } from "vitest";
import {
  ensureVendorBlogSources,
  resetVendorBlogSeedCache,
  VENDOR_BLOG_SEED_SQL,
} from "../sources/seed.js";

describe("ensureVendorBlogSources", () => {
  it("matches the 0018 INSERT OR IGNORE vendor blogs", () => {
    expect(VENDOR_BLOG_SEED_SQL).toContain("'openai'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'anthropic'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'google-ai'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'hf-blog'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'marketbrief'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'xai'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'deepmind'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'aws-ml'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'mit-tr-ai'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'marktechpost'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'google-research'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'simonwillison'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'the-decoder'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'mit-news-ai'");
    expect(VENDOR_BLOG_SEED_SQL).toContain("'lastweekin-ai'");
  });

  it("runs the seed SQL once", async () => {
    resetVendorBlogSeedCache();
    let runs = 0;
    const db = {
      prepare(sql: string) {
        expect(sql).toContain("INSERT OR IGNORE INTO sources");
        return {
          run: async () => {
            runs += 1;
          },
        };
      },
    } as unknown as D1Database;
    await ensureVendorBlogSources(db);
    await ensureVendorBlogSources(db);
    expect(runs).toBe(1);
  });
});
