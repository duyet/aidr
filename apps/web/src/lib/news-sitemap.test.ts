import { afterEach, describe, expect, it, vi } from "vitest";
import { expectWellFormedXml } from "./__fixtures__/xml";
import {
  buildNewsSitemapXml,
  NEWS_NAMESPACE,
  NEWS_SITEMAP_MAX_ENTRIES,
  NEWS_TITLE_MAX,
  newsEntryForItem,
  safeNewsSitemapResponse,
  w3cPublicationDate,
} from "./news-sitemap";
import { SITE_NAME, SITE_URL } from "./site";
import type { FeedItem } from "./types";

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    url: "https://news.ycombinator.com/item?id=1",
    title: "OpenAI ships a faster reasoning model",
    title_vi: null,
    summary: "Summary.",
    summary_vi: null,
    category: "Models",
    published_at: 1_787_000_000,
    points: 1,
    comments: 0,
    rank_score: 1,
    source_id: "hn",
    tags: [],
    sources: [],
    llm_tokens: 0,
    image_url: null,
    ...overrides,
  };
}

describe("w3cPublicationDate", () => {
  it("renders a W3C datetime in the reader timezone from epoch seconds", () => {
    // 2026-08-17T20:53:20Z is 2026-08-18T03:53:20+07:00 in Asia/Ho_Chi_Minh.
    expect(w3cPublicationDate(1_787_000_000)).toBe("2026-08-18T03:53:20+07:00");
  });

  it("normalizes a millisecond published_at instead of rendering year 2286", () => {
    expect(w3cPublicationDate(1_787_000_000_000)).toBe(
      "2026-08-18T03:53:20+07:00"
    );
    expect(w3cPublicationDate(1_787_000_000_000)).not.toContain("2286");
  });

  it("returns an empty string for a missing or unusable timestamp", () => {
    expect(w3cPublicationDate(0)).toBe("");
    expect(w3cPublicationDate(null)).toBe("");
    expect(w3cPublicationDate(Number.NaN)).toBe("");
  });
});

describe("newsEntryForItem", () => {
  it("submits the Vietnamese variant when a translation exists", () => {
    const entry = newsEntryForItem(
      item({ title_vi: "OpenAI ra mắt mô hình suy luận nhanh hơn" })
    );
    expect(entry.language).toBe("vi");
    expect(entry.loc).toBe(`${SITE_URL}/abcdef12?lang=vi`);
    expect(entry.title).toBe("OpenAI ra mắt mô hình suy luận nhanh hơn");
  });

  it("submits the English variant for an untranslated story rather than mislabeling it", () => {
    const entry = newsEntryForItem(item({ title_vi: null }));
    expect(entry.language).toBe("en");
    expect(entry.loc).toBe(`${SITE_URL}/abcdef12?lang=en`);
  });

  it("treats a whitespace-only translation as untranslated", () => {
    expect(newsEntryForItem(item({ title_vi: "   " })).language).toBe("en");
  });
});

describe("buildNewsSitemapXml", () => {
  it("emits the news namespace, aidr publication, language, and W3C date", () => {
    const xml = buildNewsSitemapXml([
      {
        loc: `${SITE_URL}/abcdef12?lang=vi`,
        title: "OpenAI ra mắt mô hình mới",
        language: "vi",
        publicationDate: "2026-08-18T03:53:20+07:00",
      },
      {
        loc: `${SITE_URL}/bcdef123?lang=en`,
        title: "Anthropic & friends ship <something>",
        language: "en",
        publicationDate: "2026-08-18T04:00:00+07:00",
      },
    ]);
    expectWellFormedXml(xml, "news.xml");
    expect(xml).toContain(`xmlns:news="${NEWS_NAMESPACE}"`);
    expect(xml).toContain("<news:publication>");
    expect(xml).toContain(`<news:name>${SITE_NAME}</news:name>`);
    expect(xml).toContain("<news:language>vi</news:language>");
    expect(xml).toContain("<news:language>en</news:language>");
    expect(xml).toContain(
      "<news:publication_date>2026-08-18T03:53:20+07:00</news:publication_date>"
    );
    expect(xml).toContain("Anthropic &amp; friends ship &lt;something&gt;");
    // One news:news per url, and no upstream outlet is mislabeled as the source.
    expect([...xml.matchAll(/<news:news>/g)].length).toBe(2);
    expect([...xml.matchAll(/<url>/g)].length).toBe(2);
  });

  it("emits a valid empty urlset when there is nothing to submit", () => {
    const xml = buildNewsSitemapXml([]);
    expectWellFormedXml(xml, "news.xml");
    expect(xml).toContain("</urlset>");
    expect(xml).not.toContain("<url>");
  });

  it("stays valid for a hostile 1,000-entry payload", () => {
    const entries = Array.from(
      { length: NEWS_SITEMAP_MAX_ENTRIES },
      (_, i) => ({
        loc: `${SITE_URL}/${i.toString(16).padStart(8, "0")}?lang=en`,
        title: `Story ${i} & <b>"quoted"</b> 'text' \u0007`,
        language: "en" as const,
        publicationDate: "2026-08-18T03:53:20+07:00",
      })
    );
    const xml = buildNewsSitemapXml(entries);
    expectWellFormedXml(xml, "news.xml");
    expect([...xml.matchAll(/<news:news>/g)].length).toBeLessThanOrEqual(
      NEWS_SITEMAP_MAX_ENTRIES
    );
  });

  it("documents a title cap for the news headline", () => {
    expect(NEWS_TITLE_MAX).toBeGreaterThan(0);
    expect(NEWS_TITLE_MAX).toBeLessThan(1_000);
  });
});

describe("safeNewsSitemapResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays 200 valid XML when the loader fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await safeNewsSitemapResponse(async () => {
      throw new Error("D1 unavailable");
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/xml/);
    const xml = await response.text();
    expectWellFormedXml(xml, "news.xml fallback");
    expect(xml).toContain("</urlset>");
    expect(console.error).toHaveBeenCalled();
  });

  it("returns the loaded document and marks it indexable", async () => {
    const response = await safeNewsSitemapResponse(() => [
      {
        loc: `${SITE_URL}/abcdef12?lang=en`,
        title: "Story",
        language: "en",
        publicationDate: "2026-08-18T03:53:20+07:00",
      },
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("index, follow");
    const xml = await response.text();
    expectWellFormedXml(xml, "news.xml");
    expect(xml).toContain("<news:title>Story</news:title>");
  });
});
