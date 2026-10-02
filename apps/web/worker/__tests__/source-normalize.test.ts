import { afterEach, describe, expect, it, vi } from "vitest";
import { adapters } from "../sources/registry.js";

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
