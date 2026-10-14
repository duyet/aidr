import { afterEach, describe, expect, it, vi } from "vitest";
import { adapters, normalizeFetchedItem } from "../sources/registry.js";

afterEach(() => vi.unstubAllGlobals());

// the-decoder ships CDATA titles with numeric entities and marketbrief-style
// wires prefix "UPDATE:". Stored titles must be plain text either way, and
// the URL (which the item id hashes) must not change.
const FEED = `<?xml version="1.0"?><rss><channel>
<item>
  <title><![CDATA[UPDATE: OpenAI&#039;s agents &amp; tools]]></title>
  <link>https://example.com/a?x=1&amp;y=2</link>
  <description><![CDATA[<p>It&#8217;s here</p>]]></description>
  <pubDate>Wed, 01 Oct 2026 01:00:00 GMT</pubDate>
</item>
</channel></rss>`;

describe("source adapter normalization", () => {
  it("decodes entities and strips wire markers for every fetched item", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(FEED, { status: 200 }))
    );
    const items = await adapters.rss.fetchItems(
      { feed: "https://example.com/rss.xml" },
      0
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("OpenAI's agents & tools");
    expect(items[0]?.summary).toBe("It’s here");
    expect(items[0]?.url).toBe("https://example.com/a?x=1&y=2");
  });
});

// Issue #714: Techmeme descriptions arrive with named accent entities that
// the decoder skipped, so the stored summary read "Na&oacute;n" and the
// byline never matched the attribution strip.
describe("accented entities in Techmeme summaries", () => {
  const TECHMEME = `<?xml version="1.0"?><rss><channel>
<item>
  <title>Causa Prima raised a $20M seed (Camila Grigera Na&oacute;n/Fortune)</title>
  <link>https://example.com/causa</link>
  <description>&lt;p&gt;By Camila Grigera Na&amp;oacute;n / Fortune.&lt;/p&gt; Gen&amp;eacute; Teare / Crunchbase News : Europe up &amp;amp; away</description>
  <pubDate>Wed, 14 Oct 2026 03:10:00 GMT</pubDate>
</item>
</channel></rss>`;

  it("stores the accented letters, never the entity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(TECHMEME, { status: 200 }))
    );
    const [item] = await adapters.rss.fetchItems(
      { feed: "https://www.techmeme.com/feed.xml" },
      0
    );
    expect(item?.title).toContain("Naón");
    expect(item?.summary).toContain("Naón");
    expect(item?.summary).toContain("Gené Teare");
    expect(`${item?.title}${item?.summary}`).not.toMatch(/&[a-z]+;/i);
  });

  it("leaves a summary with a literal ampersand alone", () => {
    const item = normalizeFetchedItem({
      id: "x",
      title: "AT&T buys AI lab",
      url: "https://example.com/att",
      summary: "AT&T & friends: R&D at 5% - Q&A",
      publishedAt: 1,
      points: 0,
      comments: 0,
    } as never);
    expect(item.title).toBe("AT&T buys AI lab");
    expect(item.summary).toBe("AT&T & friends: R&D at 5% - Q&A");
  });
});

// Story a60e74fc: a digest bullet opened with "← Back to live feed · 1
// stories across 1 day", page chrome stored as the summary's first words.
// Ingest must store the article text only, or every later prompt (score,
// TL;DR, translate) reads the chrome as news.
describe("feed chrome in summaries", () => {
  it("strips the aggregator back-to-feed line before storage", () => {
    const item = normalizeFetchedItem({
      title: "OpenAI notifies organizations",
      url: "https://example.com/story",
      publishedAt: 0,
      summary:
        "← Back to live feed · 1 stories across 1 day OpenAI had notified more than 100 organizations by Sept. 26.",
    });
    expect(item.summary).toBe(
      "OpenAI had notified more than 100 organizations by Sept. 26."
    );
  });

  // #652, item 7b847b25: The Decoder's footer was stored, summarized and
  // translated as if it were the story's last sentence.
  it("strips the feed footer before storage", () => {
    const item = normalizeFetchedItem({
      title:
        "Odyssey-3 is a new generative world model that you can try for free",
      url: "https://the-decoder.com/odyssey-3",
      publishedAt: 0,
      summary:
        "Odyssey is making its world model Odyssey-3 available as a public research preview. The article Odyssey-3 is a new generative world model that you can try for free appeared first on The Decoder .",
    });
    expect(item.summary).toBe(
      "Odyssey is making its world model Odyssey-3 available as a public research preview."
    );
  });
});
