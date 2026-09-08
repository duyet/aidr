import { describe, expect, it, vi } from "vitest";
import { parseRssItems, rssAdapter } from "../sources/rss.js";

const SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
  <title><![CDATA[GPT ships]]></title>
  <link>https://openai.com/index/gpt-ships</link>
  <description><![CDATA[<p>A model.</p>]]></description>
  <pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate>
</item>
<item>
  <title>Skip me</title>
  <link>/relative</link>
  <pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate>
</item>
</channel></rss>`;

describe("parseRssItems", () => {
  it("reads CDATA titles, strips HTML summaries, and skips relative links", () => {
    const items = parseRssItems(SAMPLE);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://openai.com/index/gpt-ships",
      title: "GPT ships",
      summary: "A model.",
    });
  });
});

describe("rssAdapter", () => {
  it("filters items older than sinceEpochSec", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () => new Response(SAMPLE, { status: 200 }))
    );
    const recent = await rssAdapter.fetchItems(
      { feed: "https://openai.com/news/rss.xml" },
      Math.floor(Date.parse("2026-09-06T00:00:00Z") / 1000)
    );
    expect(recent).toHaveLength(1);
    const old = await rssAdapter.fetchItems(
      { feed: "https://openai.com/news/rss.xml" },
      Math.floor(Date.parse("2026-09-08T00:00:00Z") / 1000)
    );
    expect(old).toHaveLength(0);
  });
});
