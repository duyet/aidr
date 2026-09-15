import { afterEach, describe, expect, it, vi } from "vitest";
import { parseXaiNews, parseXaiSitemap, xaiAdapter } from "../sources/xai.js";

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url>
    <loc>https://x.ai/news</loc>
    <lastmod>2026-09-15T00:00:00.000Z</lastmod>
  </url>
  <url>
    <loc>https://x.ai/news/grok-4-6</loc>
    <lastmod>2026-08-12T00:00:00.000Z</lastmod>
  </url>
  <url>
    <loc>https://x.ai/grok</loc>
    <lastmod>2026-09-15T00:00:00.000Z</lastmod>
  </url>
  <url>
    <loc>https://x.ai/news/grok-4-6</loc>
    <lastmod>2026-08-12T00:00:00.000Z</lastmod>
  </url>
</urlset>`;

const HTML = `
<a href="/news/grok-4-6">
  <h3>Introducing Grok 4.6</h3>
</a>
<a href="/news">index</a>
`;

describe("parseXaiSitemap", () => {
  it("keeps /news/<slug> locs and skips the index and non-news paths", () => {
    const items = parseXaiSitemap(SITEMAP);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://x.ai/news/grok-4-6",
      title: "Grok 4 6",
    });
    expect(items[0].publishedAt).toBe(Date.parse("2026-08-12T00:00:00.000Z"));
  });
});

describe("parseXaiNews", () => {
  it("maps listing headings onto news URLs", () => {
    const titles = parseXaiNews(HTML);
    expect(titles.get("https://x.ai/news/grok-4-6")).toBe(
      "Introducing Grok 4.6"
    );
  });
});

describe("xaiAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers listing titles and filters by sinceEpochSec", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("sitemap")) {
          return new Response(SITEMAP, { status: 200 });
        }
        return new Response(HTML, { status: 200 });
      })
    );
    const recent = await xaiAdapter.fetchItems(
      {},
      Math.floor(Date.parse("2026-08-01T00:00:00Z") / 1000)
    );
    expect(recent).toHaveLength(1);
    expect(recent[0].title).toBe("Introducing Grok 4.6");
    const old = await xaiAdapter.fetchItems(
      {},
      Math.floor(Date.parse("2026-09-01T00:00:00Z") / 1000)
    );
    expect(old).toHaveLength(0);
  });
});
