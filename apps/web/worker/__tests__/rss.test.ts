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

  it("collects bounded RSS media candidates and a video poster", () => {
    const xml = `<item>
      <title>Video story</title>
      <link>https://example.com/video</link>
      <pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate>
      <media:thumbnail url="https://example.com/poster.jpg" />
      <media:content url="https://example.com/story.mp4" type="video/mp4" />
    </item>`;
    const [item] = parseRssItems(xml);
    expect(item.media).toEqual([
      { type: "image", url: "https://example.com/poster.jpg" },
      {
        type: "video",
        url: "https://example.com/story.mp4",
        poster_url: "https://example.com/poster.jpg",
      },
    ]);
  });

  it("reads Atom entries with link href and updated dates", () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <title>LLM prompting tips</title>
  <link href="https://simonwillison.net/2026/Sep/18/tips/"/>
  <id>https://simonwillison.net/2026/Sep/18/tips/</id>
  <updated>2026-09-18T14:36:41+00:00</updated>
  <summary>Notes on prompting.</summary>
</entry>
<entry>
  <title>Skip me</title>
  <link href="/relative/path"/>
  <updated>2026-09-18T14:00:00+00:00</updated>
</entry>
</feed>`;
    const items = parseRssItems(atom);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://simonwillison.net/2026/Sep/18/tips/",
      title: "LLM prompting tips",
      summary: "Notes on prompting.",
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
