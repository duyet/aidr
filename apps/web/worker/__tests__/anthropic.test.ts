import { describe, expect, it } from "vitest";
import { parseAnthropicNews } from "../sources/anthropic.js";

const HTML = `
<a href="/news/claude-opus-5" class="sideLink">
  <div class="meta"><span>Product</span><time>Jul 24, 2026</time></div>
  <h4 class="title">Introducing Claude Opus 5</h4>
</a>
<a href="/news/claude-opus-5" class="dup">
  <time>Jul 24, 2026</time>
  <h4>Introducing Claude Opus 5</h4>
</a>
<a href="/news">index</a>
`;

describe("parseAnthropicNews", () => {
  it("dedupes listing cards and maps time + title", () => {
    const items = parseAnthropicNews(HTML);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://www.anthropic.com/news/claude-opus-5",
      title: "Introducing Claude Opus 5",
    });
    expect(items[0].publishedAt).toBe(Date.UTC(2026, 6, 24));
  });
});
