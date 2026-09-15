import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(dirname, "../../migrations/0018_vendor_blogs.sql"),
  "utf-8"
);

describe("migration 0018_vendor_blogs", () => {
  it("seeds OpenAI, Anthropic, Google AI, and Hugging Face blog sources", () => {
    expect(sql).toContain("'openai'");
    expect(sql).toContain("openai.com/news/rss.xml");
    expect(sql).toContain("'anthropic'");
    expect(sql).toContain("'google-ai'");
    expect(sql).toContain("'hf-blog'");
    expect(sql).toContain("huggingface.co/blog/feed.xml");
  });
});

describe("migration 0020_marketbrief", () => {
  it("seeds the MarketBrief AI hub source", () => {
    const sql0020 = readFileSync(
      path.join(dirname, "../../migrations/0020_marketbrief.sql"),
      "utf-8"
    );
    expect(sql0020).toContain("'marketbrief'");
    expect(sql0020).toContain("https://marketbrief.now");
    expect(sql0020).toContain('"topics":["ai"]');
  });
});

describe("migration 0021_xai_deepmind_aws", () => {
  it("seeds xAI sitemap plus DeepMind, AWS ML, and Google Developers RSS", () => {
    const sql0021 = readFileSync(
      path.join(dirname, "../../migrations/0021_xai_deepmind_aws.sql"),
      "utf-8"
    );
    expect(sql0021).toContain("'xai'");
    expect(sql0021).toContain("https://x.ai/sitemap.xml");
    expect(sql0021).toContain("'deepmind'");
    expect(sql0021).toContain("deepmind.google/blog/rss.xml");
    expect(sql0021).toContain("'aws-ml'");
    expect(sql0021).toContain("aws.amazon.com/blogs/machine-learning/feed/");
    expect(sql0021).toContain("'google-dev'");
  });
});
