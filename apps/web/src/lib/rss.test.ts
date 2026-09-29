import { describe, expect, it } from "vitest";
import { expectWellFormedXml } from "./__fixtures__/xml";
import {
  buildRssXml,
  epochSeconds,
  feedItemPermalink,
  RSS_DESCRIPTION_MAX,
  RSS_ITEM_LIMIT,
  RSS_MAX_BYTES,
  renderedSummary,
  renderedTitle,
  rfc822Date,
  validatedItemMedia,
} from "./rss";
import { SITE_URL } from "./site";
import { escapeXml } from "./sitemap";
import type { FeedItem, FeedResponse, Lang } from "./types";

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    url: "https://news.ycombinator.com/item?id=1",
    title: "OpenAI ships a faster reasoning model",
    title_vi: null,
    summary: "A short English summary.",
    summary_vi: null,
    category: "Models",
    published_at: 1_787_000_000,
    points: 10,
    comments: 2,
    rank_score: 5,
    source_id: "hn",
    tags: ["openai", "gpt-6"],
    sources: [],
    llm_tokens: 0,
    image_url: null,
    ...overrides,
  };
}

function feed(items: FeedItem[], date = "2026-08-27"): FeedResponse {
  return {
    tldr: null,
    days: [{ date, items, categoryCounts: {} }],
    categories: [],
    trending: [],
    totalStories: items.length,
    updatedAt: 1_787_000_000_000,
    lastFetchedAt: 1_787_000_000,
    hasMore: false,
  };
}

function tagsOf(xml: string): string[] {
  return [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)].map((match) => match[0]);
}

describe("epoch normalization", () => {
  it("treats published_at above 1e12 as milliseconds", () => {
    expect(epochSeconds(1_787_000_000)).toBe(1_787_000_000);
    expect(epochSeconds(1_787_000_000_000)).toBe(1_787_000_000);
    expect(epochSeconds(null)).toBe(0);
    expect(epochSeconds(Number.NaN)).toBe(0);
  });

  it("renders RFC-822 pubDate from seconds, not a year-2286 date", () => {
    // 2026-08-17T20:53:20Z
    expect(rfc822Date(1_787_000_000)).toBe("Mon, 17 Aug 2026 20:53:20 GMT");
    // The same instant stored in milliseconds must render identically.
    expect(rfc822Date(1_787_000_000_000)).toBe("Mon, 17 Aug 2026 20:53:20 GMT");
    expect(rfc822Date(1_787_000_000_000)).not.toContain("2286");
  });
});

describe("buildRssXml validity", () => {
  it("emits a well-formed RSS 2.0 document for hostile stored text", () => {
    const hostile = item({
      title: `Ampersand & <angle> "quote" 'apostrophe'`,
      title_vi: `Ký tự & < > " '`,
      summary: `Body & <b>markup</b> "quoted" 'text' with\u0000\u0007control`,
      summary_vi: `Nội dung & <b>thẻ</b> "trích" 'dẫn' \u0007`,
      category: "Models",
      tags: ["openai", "Open Source", "", "gpt-6"],
    });
    for (const lang of ["vi", "en"] as const) {
      const xml = buildRssXml(feed([hostile]), lang);
      expectWellFormedXml(xml, `rss:${lang}`);
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(
        true
      );
      expect(xml).toContain('<rss version="2.0"');
      expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
      expect(xml).toContain("</channel>\n</rss>");
      // Nothing unescaped survives into the document.
      expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
      expect(xml).not.toContain("& <");
      expect(xml).not.toContain("<angle>");
    }
    const viXml = buildRssXml(feed([hostile]), "vi");
    expect(viXml).toContain("Ký tự &amp; &lt; &gt; &quot; &apos;");
    expect(viXml).not.toContain("\u0000");
    expect(viXml).not.toContain("\u0007");
    const enXml = buildRssXml(feed([hostile]), "en");
    expect(enXml).toContain(
      "Ampersand &amp; &lt;angle&gt; &quot;quote&quot; &apos;apostrophe&apos;"
    );
    expect(enXml).toContain(
      "Body &amp; &lt;b&gt;markup&lt;/b&gt; &quot;quoted&quot; &apos;text&apos; withcontrol"
    );
  });

  it("points atom:link rel=self at the requested locale", () => {
    for (const lang of ["vi", "en"] as const) {
      const xml = buildRssXml(feed([item()]), lang);
      expectWellFormedXml(xml, "rss");
      expect(xml).toContain(
        `<atom:link rel="self" type="application/rss+xml; charset=utf-8" href="${SITE_URL}/feed.xml?lang=${lang}" />`
      );
      expect(xml).toContain(`<language>${lang}</language>`);
    }
  });
});

describe("buildRssXml item contract", () => {
  it("uses the canonical explicit-locale permalink for link and guid", () => {
    const story = item();
    for (const lang of ["vi", "en"] as const) {
      const xml = buildRssXml(feed([story]), lang);
      expectWellFormedXml(xml, "rss");
      const permalink = feedItemPermalink(story, lang);
      expect(permalink).toBe(`${SITE_URL}/abcdef12?lang=${lang}`);
      expect(xml).toContain(`<link>${permalink}</link>`);
      expect(xml).toContain(`<guid isPermaLink="true">${permalink}</guid>`);
      // No UTM, no fragment, no legacy /{category}/{slug} shape.
      expect(xml).not.toContain("utm_");
      expect(xml).not.toContain("#");
      expect(xml).not.toContain(`${SITE_URL}/models/`);
    }
  });

  it("renders the requested locale and never invents a translation", () => {
    const translated = item({
      title: "English title",
      title_vi: "Tiêu đề tiếng Việt",
      summary: "English summary.",
      summary_vi: "Tóm tắt tiếng Việt.",
    });
    const viXml = buildRssXml(feed([translated]), "vi");
    expectWellFormedXml(viXml, "rss");
    expect(viXml).toContain("<title>Tiêu đề tiếng Việt</title>");
    expect(viXml).toContain("<description>Tóm tắt tiếng Việt.</description>");
    expect(renderedTitle(translated, "vi")).toBe("Tiêu đề tiếng Việt");
    expect(renderedSummary(translated, "vi")).toBe("Tóm tắt tiếng Việt.");

    const enXml = buildRssXml(feed([translated]), "en");
    expectWellFormedXml(enXml, "rss");
    expect(enXml).toContain("<title>English title</title>");
    expect(enXml).toContain("<description>English summary.</description>");
  });

  it("falls back to the real English text for an untranslated story", () => {
    const untranslated = item({ title_vi: null, summary_vi: null });
    const xml = buildRssXml(feed([untranslated]), "vi");
    expectWellFormedXml(xml, "rss");
    expect(xml).toContain(
      "<title>OpenAI ships a faster reasoning model</title>"
    );
    expect(renderedTitle(untranslated, "vi")).toBe(
      "OpenAI ships a faster reasoning model"
    );
  });

  it("emits the scored category plus normalized topics, deduped and capped", () => {
    const xml = buildRssXml(
      feed([
        item({
          category: "research",
          tags: [
            "openai",
            "Open Source",
            "openai",
            "GPT 6",
            "!!!",
            "a",
            "b",
            "c",
            "d",
            "e",
            "f",
            "g",
            "h",
            "i",
          ],
        }),
      ]),
      "en"
    );
    expectWellFormedXml(xml, "rss");
    const block = tagsOf(xml)[0] ?? "";
    const categories = [
      ...block.matchAll(/<category>([^<]*)<\/category>/g),
    ].map((match) => match[1]);
    // Canonical enum casing, normalized topics, deduped, at most 8.
    expect(categories[0]).toBe("Research");
    expect(categories).toContain("open-source");
    expect(categories).toContain("gpt-6");
    expect(categories).not.toContain("GPT 6");
    expect(categories).not.toContain("!!!");
    expect(new Set(categories).size).toBe(categories.length);
    expect(categories.length).toBeLessThanOrEqual(8);
  });

  it("drops a category outside the scored enum instead of inventing one", () => {
    const xml = buildRssXml(
      feed([item({ category: "Made Up", tags: [] })]),
      "en"
    );
    expectWellFormedXml(xml, "rss");
    expect(xml).not.toContain("Made Up");
  });

  it("never fabricates a dc:creator", () => {
    const xml = buildRssXml(feed([item()]), "en");
    expect(xml).not.toContain("dc:creator");
    expect(xml).not.toContain("creator");
  });
});

describe("buildRssXml bounds", () => {
  it("caps item count and description length for a 1,000-item fixture", () => {
    const items = Array.from({ length: 1_000 }, (_, index) =>
      item({
        id: `${index.toString(16).padStart(64, "0")}`,
        title: `Headline ${index} ${"t".repeat(2_000)}`,
        title_vi: `Tiêu đề ${index} ${"v".repeat(2_000)}`,
        summary: `Summary ${index} ${"s".repeat(20_000)}`,
        summary_vi: `Tóm tắt ${index} ${"s".repeat(20_000)}`,
        published_at: 1_787_000_000 - index,
      })
    );
    const xml = buildRssXml(feed(items), "vi");
    expectWellFormedXml(xml, "rss");
    expect(new TextEncoder().encode(xml).length).toBeLessThanOrEqual(
      RSS_MAX_BYTES
    );
    const blocks = tagsOf(xml);
    expect(blocks.length).toBe(RSS_ITEM_LIMIT);
    // Newest first, and the tail of the fixture is dropped, not the head.
    expect(xml).toContain("<title>Tiêu đề 0 ");
    expect(xml).not.toContain("Tiêu đề 999 ");
    for (const block of blocks) {
      const description =
        /<description>([\s\S]*?)<\/description>/.exec(block)?.[1] ?? "";
      expect(description.length).toBeLessThanOrEqual(RSS_DESCRIPTION_MAX + 1);
    }
  });

  it("enforces the total byte cap even when per-item fields are legal", () => {
    // A long normalized topic is the one per-item field that can still be
    // arbitrarily long, so the document budget has to hold the line.
    const items = Array.from({ length: 10 }, (_, index) =>
      item({
        id: `${index.toString(16).padStart(64, "0")}`,
        tags: ["x".repeat(200_000)],
      })
    );
    const xml = buildRssXml(feed(items), "en");
    expectWellFormedXml(xml, "rss");
    expect(new TextEncoder().encode(xml).length).toBeLessThanOrEqual(
      RSS_MAX_BYTES
    );
    expect(tagsOf(xml).length).toBeGreaterThan(0);
    expect(tagsOf(xml).length).toBeLessThan(items.length);
  });

  it("still emits a valid channel when a single item cannot fit", () => {
    const xml = buildRssXml(
      feed([item({ tags: ["x".repeat(1_000_000)] })]),
      "en"
    );
    expectWellFormedXml(xml, "rss");
    expect(new TextEncoder().encode(xml).length).toBeLessThanOrEqual(
      RSS_MAX_BYTES
    );
    expect(tagsOf(xml).length).toBe(0);
    expect(xml).toContain("<language>en</language>");
  });
});

describe("buildRssXml media", () => {
  it("emits media:content only for a validated manifest primary", () => {
    const xml = buildRssXml(
      feed([item({ image_url: "https://images.example.com/photo.jpg" })]),
      "en"
    );
    expectWellFormedXml(xml, "rss");
    expect(xml).toContain('xmlns:media="http://search.yahoo.com/mrss/"');
    expect(xml).toContain(
      '<media:content url="https://images.example.com/photo.jpg" type="image/jpeg" medium="image" />'
    );
  });

  it("never emits a private-literal, credentialed, or clear-text upstream URL", () => {
    const rejected = [
      "http://127.0.0.1/admin/secret.png",
      "https://user:pass@images.example.com/photo.jpg",
      "http://images.example.com/photo.jpg",
      "ftp://images.example.com/photo.jpg",
      "https://intranet.local/photo.jpg",
      "javascript:alert(1)",
    ];
    for (const image_url of rejected) {
      const xml = buildRssXml(feed([item({ image_url })]), "en");
      expectWellFormedXml(xml, "rss");
      expect(xml, image_url).not.toContain("media:content");
      expect(validatedItemMedia(item({ image_url }))).toBeNull();
    }
  });

  it("omits media:content when the story has no thumbnail", () => {
    const xml = buildRssXml(feed([item({ image_url: null })]), "en");
    expectWellFormedXml(xml, "rss");
    expect(xml).not.toContain("media:content");
  });
});

describe("escapeXml", () => {
  it("escapes markup characters and drops XML-illegal control bytes", () => {
    expect(escapeXml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&apos;"
    );
    expect(escapeXml("keep\ttab and\nnewline")).toBe("keep\ttab and\nnewline");
    expect(escapeXml("drop\u0000null\u0007bell\u001funit")).toBe(
      "dropnullbellunit"
    );
    expect(escapeXml("valid\ud83d\ude80 emoji")).toBe(
      "valid\ud83d\ude80 emoji"
    );
  });
});

describe("rendered locale helpers", () => {
  it("keeps a whitespace-only translation from being treated as a translation", () => {
    const blank = item({ title_vi: "   ", summary_vi: "  " });
    expect(renderedTitle(blank, "vi")).toBe(blank.title);
    expect(renderedSummary(blank, "vi")).toBe(blank.summary);
  });

  it("uses the stored other-language summary rather than nothing", () => {
    const onlyVi = item({ summary: null, summary_vi: "Chỉ có tiếng Việt." });
    expect(renderedSummary(onlyVi, "en" as Lang)).toBe("Chỉ có tiếng Việt.");
    const onlyEn = item({ summary: "English only." });
    expect(renderedSummary(onlyEn, "vi")).toBe("English only.");
  });
});
