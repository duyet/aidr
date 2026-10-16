import { afterEach, describe, expect, it, vi } from "vitest";
import { adapters } from "../sources/registry.js";
import { resetRssHostQueues } from "../sources/rss.js";

const item = (slug: string, title: string, minute: number) =>
  `<item><title>${title}</title>
  <link>https://techcrunch.com/2026/10/09/${slug}/</link>
  <pubDate>Fri, 09 Oct 2026 12:${String(minute).padStart(2, "0")}:00 GMT</pubDate></item>`;

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
${[0, 1, 2, 3, 4, 5]
  .map((i) => item(`promo-${i}`, `Save ${i}0% on Disrupt 2026 tickets`, 30 + i))
  .join("\n")}
${[0, 1, 2]
  .map((i) => item(`story-${i}`, `Real story ${i}`, 10 + i))
  .join("\n")}
</channel></rss>`;

afterEach(() => {
  vi.unstubAllGlobals();
  resetRssHostQueues();
});

describe("event promos vs the rss flood gate", () => {
  it("drops promos before the maxItems cap so real stories keep their slots", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(FEED, { status: 200 }))
    );
    const out = await adapters.rss.fetchItems(
      { feed: "https://techcrunch.com/feed/", maxItems: 6 },
      0
    );
    expect(out.map((i) => i.title).sort()).toEqual([
      "Real story 0",
      "Real story 1",
      "Real story 2",
    ]);
  });
});
