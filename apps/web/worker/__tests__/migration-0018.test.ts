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
