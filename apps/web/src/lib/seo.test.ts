import { describe, expect, it } from "vitest";
import {
  articleHead,
  feedDiscoveryLink,
  type HeadMeta,
  type HeadScript,
  homepageHead,
  type JsonLdGraph,
  type JsonLdNode,
  jsonLdScriptBody,
  localizedPageHead,
  notFoundHead,
  pageHead,
  routeRobotsMeta,
  SITE_ORGANIZATION_ID,
  SITE_WEBSITE_ID,
} from "./seo";
import {
  SITE_DESCRIPTION,
  SITE_LOGO_URL,
  SITE_NAME,
  SITE_OG_HOME_IMAGE_URL,
  SITE_OG_IMAGE_URL,
  SITE_TITLE,
  SITE_URL,
  TELEGRAM_HANDLE,
} from "./site";
import { SITEMAP_STATIC_PATHS } from "./sitemap";
import { storyPath } from "./slug";
import type { FeedResponse, ItemSource, Lang } from "./types";

function metaContent(tags: HeadMeta[], key: string): string | undefined {
  const hit = tags.find(
    (t) =>
      ("name" in t && t.name === key) ||
      ("property" in t && t.property === key) ||
      (key === "title" && "title" in t)
  );
  return hit && "content" in hit
    ? hit.content
    : hit && "title" in hit
      ? hit.title
      : undefined;
}

// --- JSON-LD harness -------------------------------------------------------
// `HeadTags.jsonLd` is the graph the head builders publish; `HeadTags.scripts`
// is the single `application/ld+json` element the router renders from it. The
// tests assert against the *serialized* body as well, because that is what a
// crawler actually parses.

function jsonLdScripts(scripts: HeadScript[]): HeadScript[] {
  return scripts.filter((script) => script.type === "application/ld+json");
}

function parseGraph(head: {
  jsonLd: JsonLdNode[];
  scripts: HeadScript[];
}): JsonLdGraph {
  const blocks = jsonLdScripts(head.scripts);
  expect(blocks).toHaveLength(1);
  return JSON.parse(blocks[0]?.children ?? "{}") as JsonLdGraph;
}

function node<T extends JsonLdNode>(
  head: { jsonLd: JsonLdNode[] },
  type: string
): T {
  const found = head.jsonLd.find((n) => n["@type"] === type);
  if (!found) throw new Error(`no ${type} node in the graph`);
  return found as T;
}

/** The indexable route identity every graph test passes to the builders. */
const INDEXABLE_ROUTE = { pathname: "/", search: { lang: "vi" } };
const STORY_ROUTE = { pathname: "/abcdef12", search: { lang: "vi" } };

const SOURCES: ItemSource[] = [
  {
    kind: "source",
    author: "HuggingFace",
    posted_at: 1_700_000_000,
    quote: null,
    url: "https://huggingface.co/blog/olmo",
  },
  {
    kind: "discussion",
    author: "hn",
    posted_at: 1_700_000_500,
    quote: null,
    url: "https://news.ycombinator.com/item?id=1",
  },
];

const STORY = {
  id: "abcdef12deadbeef",
  title: "Reproducing OLMo 3 in MaxText",
  title_vi: "Tái tạo OLMo 3 trong MaxText",
  summary: "A case study in large-scale TPU training.",
  image_url: "https://example.com/og.png",
  category: "Research",
  url: "https://huggingface.co/blog/olmo",
  published_at: 1_700_000_000,
  sources: SOURCES,
};

function feedWith(items: string[]): FeedResponse {
  return {
    tldr: {
      date: "2026-09-27",
      bullets_en: items.map((id, i) => ({
        text: `Digest line ${i + 1}`,
        item_ids: [id],
      })),
      bullets_vi: items.map((id, i) => ({
        text: `Dòng ${i + 1}`,
        item_ids: [id],
      })),
    },
    days: [],
    categories: [],
    trending: [],
    totalStories: items.length,
    updatedAt: 1_700_000_000,
    lastFetchedAt: 1_700_000_000,
    hasMore: false,
  };
}

describe("homepageHead", () => {
  it("emits og, twitter, and canonical tags for the site", () => {
    const head = homepageHead();
    expect(metaContent(head.meta, "title")).toBe(SITE_TITLE);
    expect(SITE_TITLE).toMatch(/ranked AI digest/);
    expect(metaContent(head.meta, "description")).toBe(SITE_DESCRIPTION);
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(80);
    expect(metaContent(head.meta, "og:title")).toBe(SITE_TITLE);
    expect(metaContent(head.meta, "og:description")).toBe(SITE_DESCRIPTION);
    expect(metaContent(head.meta, "og:url")).toBe(`${SITE_URL}/?lang=vi`);
    expect(metaContent(head.meta, "og:type")).toBe("website");
    expect(metaContent(head.meta, "og:image")).toBe(SITE_OG_HOME_IMAGE_URL);
    expect(metaContent(head.meta, "og:image:width")).toBe("1200");
    expect(metaContent(head.meta, "og:image:height")).toBe("630");
    expect(metaContent(head.meta, "twitter:card")).toBe("summary_large_image");
    expect(metaContent(head.meta, "twitter:image")).toBe(
      SITE_OG_HOME_IMAGE_URL
    );
    expect(metaContent(head.meta, "twitter:title")).toBe(SITE_TITLE);
    expect(metaContent(head.meta, "twitter:description")).toBe(
      SITE_DESCRIPTION
    );
    expect(head.links).toContainEqual({
      rel: "canonical",
      href: `${SITE_URL}/?lang=vi`,
    });
    expect(head.links).toContainEqual({
      rel: "alternate",
      hrefLang: "en",
      href: `${SITE_URL}/?lang=en`,
    });
    expect(head.links).toContainEqual({
      rel: "alternate",
      hrefLang: "x-default",
      href: `${SITE_URL}/?lang=vi`,
    });
    expect(metaContent(head.meta, "og:locale")).toBe("vi_VN");
    expect(head.links.some((l) => l.rel === "sitemap")).toBe(true);
    expect(head.links).toContainEqual(feedDiscoveryLink("vi"));
  });

  it("advertises the RSS feed with an explicit locale for autodiscovery", () => {
    for (const lang of ["vi", "en"] as const) {
      const link = feedDiscoveryLink(lang);
      expect(link.rel).toBe("alternate");
      expect(link.type).toBe("application/rss+xml");
      expect(link.title && link.title.length > 0).toBe(true);
      expect(link.href).toBe(`${SITE_URL}/feed.xml?lang=${lang}`);
    }
  });

  it("keeps the feed link on /subscribe, the page that markets delivery channels", () => {
    const head = localizedPageHead({
      path: "/subscribe",
      title: "Get AI;DR | Chrome, Telegram, Email",
      lang: "en",
    });
    expect(head.links).toContainEqual(feedDiscoveryLink("en"));
  });

  it("uses the requested English locale for canonical and hreflang", () => {
    const head = homepageHead("en");
    expect(head.links).toContainEqual({
      rel: "canonical",
      href: `${SITE_URL}/?lang=en`,
    });
    expect(metaContent(head.meta, "og:locale")).toBe("en_US");
  });
});

describe("pageHead", () => {
  it("canonicalizes marketing routes to themselves, not the homepage", () => {
    const head = pageHead({ path: "/about", title: "About | AI News" });
    expect(head.links).toContainEqual({
      rel: "canonical",
      href: `${SITE_URL}/about`,
    });
    expect(metaContent(head.meta, "og:url")).toBe(`${SITE_URL}/about`);
    // Non-homepage pages share the default OG card; the masthead variant
    // is homepage-only.
    expect(metaContent(head.meta, "og:image")).toBe(SITE_OG_IMAGE_URL);
    expect(head.links).not.toContainEqual({
      rel: "canonical",
      href: `${SITE_URL}/`,
    });
  });
});

describe("localizedPageHead", () => {
  it("emits explicit canonical and hreflang URLs for a localized static route", () => {
    const head = localizedPageHead({
      path: "/mcp",
      title: "MCP | AI News",
      lang: "en",
    });
    expect(head.links).toContainEqual({
      rel: "canonical",
      href: `${SITE_URL}/mcp?lang=en`,
    });
    expect(head.links).toContainEqual({
      rel: "alternate",
      hrefLang: "vi",
      href: `${SITE_URL}/mcp?lang=vi`,
    });
    expect(head.links).toContainEqual({
      rel: "alternate",
      hrefLang: "x-default",
      href: `${SITE_URL}/mcp?lang=vi`,
    });
    expect(metaContent(head.meta, "og:url")).toBe(`${SITE_URL}/mcp?lang=en`);
    expect(head.links.some((link) => link.rel === "sitemap")).toBe(true);
  });
});

describe("articleHead", () => {
  const item = {
    id: "abcdef12deadbeef",
    title: "Stripe buys OpenRouter",
    summary: "Payments firm acquires the model gateway.",
    image_url: "https://example.com/og.png",
    category: "Industry",
  };

  it("uses the article summary as meta description and completes share tags", () => {
    const head = articleHead(item);
    expect(metaContent(head.meta, "description")).toBe(item.summary);
    expect(metaContent(head.meta, "og:description")).toBe(item.summary);
    expect(metaContent(head.meta, "twitter:description")).toBe(item.summary);
    expect(metaContent(head.meta, "og:title")).toBe(item.title);
    expect(metaContent(head.meta, "twitter:title")).toBe(item.title);
    expect(metaContent(head.meta, "og:type")).toBe("article");
    expect(metaContent(head.meta, "og:url")).toBe(
      `${SITE_URL}/abcdef12?lang=vi`
    );
    // Branded card rendered by /api/og/$id — never the upstream image_url,
    // which can 404 after ingest. The explicit locale keeps card copy aligned
    // with the story page.
    const ogImage = `${SITE_URL}/api/og/${item.id}.png?lang=vi`;
    expect(metaContent(head.meta, "og:image")).toBe(ogImage);
    expect(metaContent(head.meta, "twitter:image")).toBe(ogImage);
    expect(metaContent(head.meta, "og:image:width")).toBe("1200");
    expect(metaContent(head.meta, "og:image:height")).toBe("630");
    expect(metaContent(head.meta, "twitter:card")).toBe("summary_large_image");
    expect(head.links).toContainEqual({
      rel: "canonical",
      href: `${SITE_URL}/abcdef12?lang=vi`,
    });
    expect(head.links).toContainEqual({
      rel: "alternate",
      hrefLang: "en",
      href: `${SITE_URL}/abcdef12?lang=en`,
    });
  });

  it("builds the English article URL explicitly", () => {
    const head = articleHead(item, "en");
    expect(metaContent(head.meta, "og:url")).toBe(
      `${SITE_URL}/abcdef12?lang=en`
    );
    expect(metaContent(head.meta, "og:image")).toBe(
      `${SITE_URL}/api/og/${item.id}.png?lang=en`
    );
    expect(head.links).toContainEqual({
      rel: "canonical",
      href: `${SITE_URL}/abcdef12?lang=en`,
    });
  });

  it("falls back to the site blurb when the article has no summary", () => {
    const head = articleHead({ ...item, summary: null, image_url: null });
    expect(metaContent(head.meta, "description")).toBe(SITE_DESCRIPTION);
    expect(metaContent(head.meta, "og:description")).toBe(SITE_DESCRIPTION);
    expect(metaContent(head.meta, "twitter:card")).toBe("summary_large_image");
    expect(metaContent(head.meta, "og:image")).toBe(
      `${SITE_URL}/api/og/${item.id}.png?lang=vi`
    );
  });

  it("does not invent a Vietnamese description", () => {
    const head = articleHead(item);
    const descriptions = head.meta
      .filter(
        (t) =>
          ("name" in t && t.name === "description") ||
          ("property" in t && t.property === "og:description") ||
          ("name" in t && t.name === "twitter:description")
      )
      .map((t) => ("content" in t ? t.content : ""));
    expect(descriptions.every((d) => d === item.summary)).toBe(true);
  });
});

describe("routeRobotsMeta", () => {
  it("keeps homepage, story, about, and base subscribe indexable", () => {
    for (const pathname of ["/", "/abcdef12", "/about", "/subscribe"]) {
      expect(routeRobotsMeta({ pathname })).toEqual({
        name: "robots",
        content: "index, follow",
      });
    }
  });

  it("keeps explicit locale pages indexable while faceting other queries", () => {
    expect(routeRobotsMeta({ pathname: "/", search: { lang: "vi" } })).toEqual({
      name: "robots",
      content: "index, follow",
    });
    for (const search of [{ q: "open models" }, { utm_source: "newsletter" }]) {
      expect(routeRobotsMeta({ pathname: "/", search })).toEqual({
        name: "robots",
        content: "noindex, follow",
      });
    }
    expect(
      routeRobotsMeta({ pathname: "/subscribe", search: { tab: "email" } })
    ).toEqual({ name: "robots", content: "noindex, follow" });
  });

  it("emits noindex, nofollow for tokenized and admin HTML", () => {
    expect(
      routeRobotsMeta({
        pathname: "/subscribe",
        search: { settings: "subscriber-token" },
      })
    ).toEqual({ name: "robots", content: "noindex, nofollow" });
    expect(
      routeRobotsMeta({ pathname: "/data", search: { tab: "admin" } })
    ).toEqual({ name: "robots", content: "noindex, nofollow" });
    expect(
      routeRobotsMeta({ pathname: "/", search: { token: "   " } })
    ).toEqual({ name: "robots", content: "noindex, nofollow" });
  });
});

describe("notFoundHead", () => {
  it("sets a 404 document title, not the homepage title", () => {
    const head = notFoundHead("Không tìm thấy trang | AI News");
    expect(metaContent(head.meta, "title")).toBe(
      "Không tìm thấy trang | AI News"
    );
    expect(metaContent(head.meta, "title")).not.toBe(SITE_TITLE);
    expect(metaContent(head.meta, "robots")).toBe("noindex, follow");
  });

  it("localizes the English 404 title too", () => {
    const head = notFoundHead("Page not found | AI News");
    expect(metaContent(head.meta, "title")).toBe("Page not found | AI News");
    expect(metaContent(head.meta, "title")).not.toBe(SITE_TITLE);
  });

  it("publishes no structured data on a 404", () => {
    const head = notFoundHead("Page not found | AI News");
    expect(head.jsonLd).toEqual([]);
    expect(jsonLdScripts(head.scripts)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// JSON-LD (#224)
//
// The site emitted zero `application/ld+json` before this graph. Everything
// below asserts the values a rich-result / AI-answer extractor reads, and
// that they agree with the Open Graph / canonical tags already on the page.
// ---------------------------------------------------------------------------

describe("articleHead JSON-LD (NewsArticle)", () => {
  it("matches the rendered headline, canonical, og:image, and og:locale", () => {
    const head = articleHead(STORY, "en", { route: STORY_ROUTE });
    const article = node<JsonLdNode & { headline: string }>(
      head,
      "NewsArticle"
    );

    expect(article.headline).toBe(STORY.title);
    // Same value as the og:title / twitter:title this page already shipped.
    expect(metaContent(head.meta, "og:title")).toBe(article.headline);
    expect(article.url).toBe(metaContent(head.meta, "og:url"));
    expect(article.url).toBe(
      head.links.find((l) => l.rel === "canonical")?.href
    );
    expect(article.inLanguage).toBe("en-US");
    expect(metaContent(head.meta, "og:locale")).toBe("en_US");
    expect(article.description).toBe(metaContent(head.meta, "og:description"));
  });

  it("uses the generated first-party card, not the upstream image_url", () => {
    const head = articleHead(STORY, "en", { route: STORY_ROUTE });
    const article = node<
      JsonLdNode & { image: { url: string; width: number; height: number } }
    >(head, "NewsArticle");

    expect(article.image.url).toBe(
      `${SITE_URL}/api/og/${STORY.id}.png?lang=en`
    );
    expect(article.image.url).toBe(metaContent(head.meta, "og:image"));
    expect(article.image.width).toBe(1200);
    expect(article.image.height).toBe(630);
    expect(article.image.url).not.toContain("example.com");
  });

  it("self-references mainEntityOfPage and belongs to the site", () => {
    const head = articleHead(STORY, "en", { route: STORY_ROUTE });
    const article = node<
      JsonLdNode & {
        mainEntityOfPage: { "@type": string; "@id": string };
        isPartOf: { "@id": string };
      }
    >(head, "NewsArticle");
    const url = `${SITE_URL}${storyPath(STORY, "en")}`;

    expect(article.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": url,
    });
    expect(article.url).toBe(url);
    expect(article.isPartOf["@id"]).toBe(SITE_WEBSITE_ID);
  });

  it("emits ISO-8601 dates and never a date before datePublished", () => {
    const head = articleHead(STORY, "en", { route: STORY_ROUTE });
    const article = node<
      JsonLdNode & { datePublished: string; dateModified: string }
    >(head, "NewsArticle");

    expect(article.datePublished).toBe("2023-11-14T22:13:20.000Z");
    // The newest timestamp the story carries: the later discussion source.
    expect(article.dateModified).toBe("2023-11-14T22:21:40.000Z");
    expect(
      Date.parse(article.dateModified) >= Date.parse(article.datePublished)
    ).toBe(true);
  });

  it("falls back to datePublished when no source is newer", () => {
    const head = articleHead(
      { ...STORY, sources: [{ ...SOURCES[0]!, posted_at: null }] },
      "en",
      { route: STORY_ROUTE }
    );
    const article = node<
      JsonLdNode & { datePublished: string; dateModified: string }
    >(head, "NewsArticle");
    expect(article.dateModified).toBe(article.datePublished);
  });

  it("omits dates rather than inventing them for a non-numeric published_at", () => {
    const head = articleHead(
      { ...STORY, published_at: Number.NaN, sources: [] },
      "en",
      { route: STORY_ROUTE }
    );
    const article = node<JsonLdNode>(head, "NewsArticle");
    expect(article.datePublished).toBeUndefined();
    expect(article.dateModified).toBeUndefined();
  });

  it("names the real outlet from item_sources, never the aggregator", () => {
    const head = articleHead(STORY, "en", { route: STORY_ROUTE });
    const article = node<
      JsonLdNode & { publisher: { "@type": string; name: string; url: string } }
    >(head, "NewsArticle");

    expect(article.publisher["@type"]).toBe("Organization");
    // The first `kind: "source"` row, i.e. the outlet — not the HN thread,
    // and emphatically not SITE_NAME, because aidr only aggregates.
    expect(article.publisher.name).toBe("huggingface.co");
    expect(article.publisher.url).toBe("https://huggingface.co");
    expect(article.publisher.name).not.toBe(SITE_NAME);
  });

  it("prefers a support row over a discussion thread", () => {
    const head = articleHead(
      {
        ...STORY,
        url: "",
        sources: [
          SOURCES[1]!,
          {
            kind: "support",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://arxiv.org/abs/2401.00001",
          },
        ],
      },
      "en",
      { route: STORY_ROUTE }
    );
    const article = node<JsonLdNode & { publisher: { name: string } }>(
      head,
      "NewsArticle"
    );
    expect(article.publisher.name).toBe("arxiv.org");
  });

  it("omits publisher entirely when no outlet is known", () => {
    const head = articleHead({ ...STORY, url: "", sources: [] }, "en", {
      route: STORY_ROUTE,
    });
    const article = node<JsonLdNode>(head, "NewsArticle");
    expect(article.publisher).toBeUndefined();
    expect(article.author).toBeUndefined();
  });

  it("records the original article as isBasedOn", () => {
    const head = articleHead(STORY, "en", { route: STORY_ROUTE });
    const article = node<JsonLdNode & { isBasedOn: string }>(
      head,
      "NewsArticle"
    );
    expect(article.isBasedOn).toBe(STORY.url);
  });
});

describe("articleHead JSON-LD bilingual headline", () => {
  it("emits the rendered Vietnamese title and vi-VN when title_vi exists", () => {
    const head = articleHead(STORY, "vi", { route: STORY_ROUTE });
    const article = node<JsonLdNode & { headline: string; inLanguage: string }>(
      head,
      "NewsArticle"
    );

    // `localizedTitle` is the exact call StoryRow paints into the single <h1>.
    expect(article.headline).toBe(STORY.title_vi);
    expect(article.headline).not.toBe(STORY.title);
    expect(article.inLanguage).toBe("vi-VN");
    expect(metaContent(head.meta, "og:locale")).toBe("vi_VN");
  });

  it("emits the real English headline and en-US when VI has no title_vi", () => {
    const head = articleHead({ ...STORY, title_vi: null }, "vi", {
      route: STORY_ROUTE,
    });
    const article = node<JsonLdNode & { headline: string; inLanguage: string }>(
      head,
      "NewsArticle"
    );

    // Never an invented translation: the painted headline is the English one,
    // and `en-US` on a ?lang=vi URL is the machine-readable record of that.
    expect(article.headline).toBe(STORY.title);
    expect(article.inLanguage).toBe("en-US");
    expect(metaContent(head.meta, "og:locale")).toBe("vi_VN");
    expect(article.url).toBe(`${SITE_URL}/abcdef12?lang=vi`);
  });

  it("treats a blank title_vi as missing, not as a translation", () => {
    const head = articleHead({ ...STORY, title_vi: "   " }, "vi", {
      route: STORY_ROUTE,
    });
    const article = node<JsonLdNode & { headline: string; inLanguage: string }>(
      head,
      "NewsArticle"
    );
    expect(article.headline).toBe(STORY.title);
    expect(article.inLanguage).toBe("en-US");
  });

  it("keeps an already-Vietnamese source title as Vietnamese", () => {
    const head = articleHead(
      { ...STORY, title: "Tái tạo OLMo 3 trong MaxText", title_vi: null },
      "vi",
      { route: STORY_ROUTE }
    );
    const article = node<JsonLdNode & { headline: string; inLanguage: string }>(
      head,
      "NewsArticle"
    );
    expect(article.headline).toBe("Tái tạo OLMo 3 trong MaxText");
    expect(article.inLanguage).toBe("vi-VN");
  });

  it("never leaks the other language's text between the two URLs", () => {
    const vi = articleHead(STORY, "vi", { route: STORY_ROUTE });
    const en = articleHead(STORY, "en", { route: STORY_ROUTE });
    const viArticle = node<JsonLdNode & { headline: string }>(
      vi,
      "NewsArticle"
    );
    const enArticle = node<JsonLdNode & { headline: string }>(
      en,
      "NewsArticle"
    );

    expect(viArticle.headline).not.toBe(enArticle.headline);
    expect(viArticle.url).not.toBe(enArticle.url);
    // The Vietnamese graph carries no copy of the English-only headline.
    expect(JSON.stringify(vi.jsonLd)).not.toContain(STORY.title);
    expect(JSON.stringify(en.jsonLd)).not.toContain(STORY.title_vi);
  });
});

describe("JSON-LD script safety", () => {
  // Regression fixture: the exact hostile shapes a publisher title or digest
  // bullet can carry. All of them try to close the <script> element or open an
  // HTML comment inside it.
  const HOSTILE = `</script><script>alert(1)</script><!-- ]]> \u2028 \u2029 & <b>bold</b>`;

  it("keeps a hostile publisher title inside the script block", () => {
    const head = articleHead(
      { ...STORY, title: HOSTILE, title_vi: HOSTILE, summary: HOSTILE },
      "en",
      { route: STORY_ROUTE }
    );
    const body = jsonLdScripts(head.scripts)[0]?.children ?? "";

    // Nothing that could terminate the element or open a tag survives.
    expect(body).not.toContain("<");
    expect(body).not.toContain(">");
    expect(body).not.toContain("</script");
    expect(body).not.toContain("<!--");
    expect(body).not.toContain("]]>");
    // The text is still recoverable, byte for byte, after JSON.parse.
    const graph = parseGraph(head);
    const article = graph["@graph"].find((n) => n["@type"] === "NewsArticle");
    expect(article?.headline).toBe(HOSTILE);
    expect(article?.description).toBe(HOSTILE);
  });

  it("keeps a hostile digest bullet inert on the homepage", () => {
    const feed = feedWith(["aaaaaaaa"]);
    feed.tldr = {
      date: "2026-09-27",
      bullets_en: [{ text: HOSTILE, item_ids: ["aaaaaaaa"] }],
      bullets_vi: [{ text: HOSTILE, item_ids: ["aaaaaaaa"] }],
    };
    const head = homepageHead("en", { feed, route: INDEXABLE_ROUTE });
    const body = jsonLdScripts(head.scripts)[0]?.children ?? "";

    expect(body).not.toContain("<");
    expect(body).not.toContain("</script");
    const list = node<JsonLdNode & { itemListElement: { name: string }[] }>(
      head,
      "ItemList"
    );
    expect(list.itemListElement[0]?.name).toBe(HOSTILE);
  });

  it("escapes with JSON escapes, not HTML entities, so the block still parses", () => {
    const graph: JsonLdGraph = {
      "@context": "https://schema.org",
      "@graph": [{ "@type": "Thing", name: "a & b < c" }],
    };
    const body = jsonLdScriptBody(graph);

    expect(body).toContain("\\u003c");
    expect(body).toContain("\\u0026");
    expect(body).not.toContain("&amp;");
    expect(JSON.parse(body)["@graph"][0]?.name).toBe("a & b < c");
  });
});

describe("JSON-LD never fabricates review signals", () => {
  const FORBIDDEN = [
    "aggregateRating",
    "review",
    "author",
    "NewsMediaOrganization",
  ];

  it("emits none of them on a story page", () => {
    const head = articleHead(STORY, "en", { route: STORY_ROUTE });
    const body = jsonLdScripts(head.scripts)[0]?.children ?? "";
    for (const key of FORBIDDEN) {
      expect(body).not.toContain(`"${key}"`);
    }
  });

  it("emits none of them on the homepage or a static page", () => {
    const heads = [
      homepageHead("en", {
        feed: feedWith(["aaaaaaaa"]),
        route: INDEXABLE_ROUTE,
      }),
      pageHead({ path: "/about", title: "About", route: INDEXABLE_ROUTE }),
    ];
    for (const head of heads) {
      const body = jsonLdScripts(head.scripts)[0]?.children ?? "";
      for (const key of FORBIDDEN) {
        expect(body).not.toContain(`"${key}"`);
      }
    }
  });
});

describe("homepageHead JSON-LD (WebSite / Organization / ItemList)", () => {
  const ids = [
    "0031a3a8",
    "071a284c",
    "0bfc1509",
    "3690d873",
    "3d63b0c4",
    "58eaba4e",
    "7e0bbc5c",
    "b9fcfe61",
  ];

  it("describes the site once, with the resolved brand and real origin", () => {
    const head = homepageHead("en", {
      feed: feedWith(ids),
      route: INDEXABLE_ROUTE,
    });
    const website = node<
      JsonLdNode & {
        name: string;
        url: string;
        publisher: { "@id": string };
        potentialAction?: unknown;
      }
    >(head, "WebSite");
    const org = node<
      JsonLdNode & { name: string; url: string; logo: { url: string } }
    >(head, "Organization");

    expect(website["@id"]).toBe(SITE_WEBSITE_ID);
    expect(website.name).toBe(SITE_NAME);
    expect(website.url).toBe(`${SITE_URL}/?lang=en`);
    expect(website.publisher["@id"]).toBe(SITE_ORGANIZATION_ID);
    expect(org["@id"]).toBe(SITE_ORGANIZATION_ID);
    expect(org.name).toBe(SITE_NAME);
    expect(org.url).toBe(`${SITE_URL}/`);
    expect(org.logo.url).toBe(SITE_LOGO_URL);
    // No site-search results page exists, so no SearchAction is claimed.
    expect(website.potentialAction).toBeUndefined();
  });

  it("lists only the story URLs the SSR HTML anchors", () => {
    const head = homepageHead("en", {
      feed: feedWith(ids),
      route: INDEXABLE_ROUTE,
    });
    const list = node<
      JsonLdNode & {
        numberOfItems: number;
        itemListElement: { position: number; url: string; name: string }[];
      }
    >(head, "ItemList");

    expect(list.numberOfItems).toBe(ids.length);
    expect(list.itemListElement.map((entry) => entry.url)).toEqual(
      // Recomputed here from the bullet ids, not read back from the graph.
      ids.map((id) => `${SITE_URL}${storyPath({ id }, "en")}`)
    );
    // Positions are dense and 1-based: no gaps, no invented entries.
    expect(list.itemListElement.map((entry) => entry.position)).toEqual(
      ids.map((_, index) => index + 1)
    );
    for (const entry of list.itemListElement) {
      expect(entry.url).toMatch(
        new RegExp(`^${SITE_URL}/[0-9a-f]{8}\\?lang=en$`)
      );
    }
  });

  it("emits no ItemList when the section paints no anchor", () => {
    const head = homepageHead("en", { feed: null, route: INDEXABLE_ROUTE });
    expect(head.jsonLd.find((n) => n["@type"] === "ItemList")).toBeUndefined();
    expect(head.jsonLd.length).toBeGreaterThan(0);
  });

  it("drops a bullet with no item id, exactly as the paint drops its anchor", () => {
    const feed = feedWith(["aaaaaaaa"]);
    feed.tldr = {
      date: "2026-09-27",
      bullets_en: [
        { text: "No story attached", item_ids: [] },
        { text: "Has a story", item_ids: ["bbbbbbbb"] },
      ],
      bullets_vi: feed.tldr!.bullets_vi,
    };
    const head = homepageHead("en", { feed, route: INDEXABLE_ROUTE });
    const list = node<JsonLdNode & { itemListElement: { url: string }[] }>(
      head,
      "ItemList"
    );

    expect(list.itemListElement).toHaveLength(1);
    expect(list.itemListElement[0]?.url).toBe(`${SITE_URL}/bbbbbbbb?lang=en`);
  });

  it("emits distinct, correct per-language graphs", () => {
    const vi = homepageHead("vi", {
      feed: feedWith(ids),
      route: INDEXABLE_ROUTE,
    });
    const en = homepageHead("en", {
      feed: feedWith(ids),
      route: INDEXABLE_ROUTE,
    });
    const viSite = node<JsonLdNode & { inLanguage: string }>(vi, "WebSite");
    const enSite = node<JsonLdNode & { inLanguage: string }>(en, "WebSite");
    const viList = node<JsonLdNode & { itemListElement: { url: string }[] }>(
      vi,
      "ItemList"
    );
    const enList = node<JsonLdNode & { itemListElement: { url: string }[] }>(
      en,
      "ItemList"
    );

    expect(viSite.inLanguage).toBe("vi-VN");
    expect(enSite.inLanguage).toBe("en-US");
    expect(viList.itemListElement[0]?.url).toContain("lang=vi");
    expect(enList.itemListElement[0]?.url).toContain("lang=en");
    // The Vietnamese page must not publish English-only entity text.
    expect(JSON.stringify(vi.jsonLd)).not.toContain("Digest line 1");
  });

  it("self-canonicals the homepage breadcrumb", () => {
    const head = homepageHead("en", {
      feed: feedWith(ids),
      route: INDEXABLE_ROUTE,
    });
    const crumbs = node<
      JsonLdNode & { itemListElement: { position: number; item: string }[] }
    >(head, "BreadcrumbList");

    expect(crumbs.itemListElement).toHaveLength(1);
    expect(crumbs.itemListElement[0]).toMatchObject({
      position: 1,
      item: `${SITE_URL}/?lang=en`,
    });
  });
});

describe("static page JSON-LD (WebPage / BreadcrumbList)", () => {
  // Every path the sitemap advertises must describe itself. The list is the
  // sitemap constant, so a new static path cannot be added without this failing.
  const headFor = (path: string, lang?: Lang) =>
    path === "/"
      ? homepageHead(lang ?? "en", {
          feed: feedWith(["aaaaaaaa"]),
          route: { pathname: "/", search: { lang: lang ?? "en" } },
        })
      : lang
        ? localizedPageHead({
            path,
            title: `${path} | AI News`,
            lang,
            route: { pathname: path, search: { lang } },
          })
        : pageHead({
            path,
            title: `${path} | AI News`,
            route: { pathname: path, search: {} },
          });

  it("covers every SITEMAP_STATIC_PATHS entry", () => {
    for (const path of SITEMAP_STATIC_PATHS) {
      const head = headFor(path);
      const types = head.jsonLd.map((n) => n["@type"]);
      expect(types, path).toContain("WebPage");
      expect(types, path).toContain("BreadcrumbList");
    }
  });

  it("self-canonicals each static page and ends its breadcrumb with itself", () => {
    for (const path of SITEMAP_STATIC_PATHS) {
      const head = headFor(path);
      const page = node<JsonLdNode & { url: string; "@id": string }>(
        head,
        "WebPage"
      );
      const crumbs = node<
        JsonLdNode & {
          itemListElement: { position: number; name: string; item: string }[];
        }
      >(head, "BreadcrumbList");
      const last = crumbs.itemListElement[crumbs.itemListElement.length - 1];

      expect(page["@id"]).toBe(page.url);
      expect(page.url).toBe(metaContent(head.meta, "og:url"));
      expect(last?.item).toBe(page.url);
      expect(crumbs.itemListElement.map((c) => c.position)).toEqual(
        crumbs.itemListElement.map((_, index) => index + 1)
      );
    }
  });

  it("declares the page language, and English for neutral pages", () => {
    expect(
      node<JsonLdNode & { inLanguage: string }>(
        headFor("/mcp", "vi"),
        "WebPage"
      ).inLanguage
    ).toBe("vi-VN");
    expect(
      node<JsonLdNode & { inLanguage: string }>(
        headFor("/mcp", "en"),
        "WebPage"
      ).inLanguage
    ).toBe("en-US");
    // /about, /privacy, /terms, /brand, /data render in English only.
    expect(
      node<JsonLdNode & { inLanguage: string }>(headFor("/about"), "WebPage")
        .inLanguage
    ).toBe("en-US");
  });

  it("roots the breadcrumb at the language-matched homepage", () => {
    const vi = node<
      JsonLdNode & { itemListElement: { item: string; name: string }[] }
    >(headFor("/changelog", "vi"), "BreadcrumbList");
    const en = node<
      JsonLdNode & { itemListElement: { item: string; name: string }[] }
    >(headFor("/changelog", "en"), "BreadcrumbList");

    expect(vi.itemListElement[0]?.item).toBe(`${SITE_URL}/?lang=vi`);
    expect(en.itemListElement[0]?.item).toBe(`${SITE_URL}/?lang=en`);
  });
});

describe("JSON-LD agrees with routeIndexability()", () => {
  it("emits no graph on a faceted homepage", () => {
    const head = homepageHead("en", {
      feed: feedWith(["aaaaaaaa"]),
      route: { pathname: "/", search: { q: "open models" } },
    });
    expect(head.jsonLd).toEqual([]);
    expect(jsonLdScripts(head.scripts)).toEqual([]);
    expect(
      routeRobotsMeta({ pathname: "/", search: { q: "open models" } })
    ).toEqual({
      name: "robots",
      content: "noindex, follow",
    });
  });

  it("emits no graph when a route validator would have dropped the query", () => {
    // The gate reads the raw query, not the route's validated `match.search`:
    // `?lang=vi&utm_source=telegram` is faceted, and `match.search` for the
    // homepage would have dropped `utm_source` entirely.
    const head = homepageHead("vi", {
      feed: feedWith(["aaaaaaaa"]),
      route: {
        pathname: "/",
        search: new URLSearchParams("lang=vi&utm_source=telegram"),
      },
    });
    expect(head.jsonLd).toEqual([]);
    expect(jsonLdScripts(head.scripts)).toEqual([]);
  });

  it("emits no graph on a tokenized static page or a private story search", () => {
    expect(
      pageHead({
        path: "/subscribe",
        title: "Get AI;DR",
        route: {
          pathname: "/subscribe",
          search: { settings: "subscriber-token" },
        },
      }).jsonLd
    ).toEqual([]);
    expect(
      articleHead(STORY, "en", {
        route: { pathname: "/abcdef12", search: { token: "   " } },
      }).jsonLd
    ).toEqual([]);
  });

  it("fails closed when a builder is given no route identity", () => {
    expect(pageHead({ path: "/about", title: "About" }).jsonLd).toEqual([]);
    expect(homepageHead("en").jsonLd).toEqual([]);
    expect(articleHead(STORY, "en").jsonLd).toEqual([]);
  });

  it("emits no graph when the route ends up a 404 or a 500", () => {
    expect(
      articleHead(STORY, "en", {
        route: { pathname: "/abcdef12", search: { lang: "en" }, status: 404 },
      }).jsonLd
    ).toEqual([]);
    expect(
      pageHead({
        path: "/about",
        title: "About",
        route: { pathname: "/about", status: 500 },
      }).jsonLd
    ).toEqual([]);
  });
});

describe("one JSON-LD block per document", () => {
  it("wraps every node in a single @graph with the schema.org context", () => {
    const heads = [
      homepageHead("vi", {
        feed: feedWith(["aaaaaaaa"]),
        route: INDEXABLE_ROUTE,
      }),
      articleHead(STORY, "vi", { route: STORY_ROUTE }),
      pageHead({ path: "/about", title: "About", route: INDEXABLE_ROUTE }),
    ];
    for (const head of heads) {
      const graph = parseGraph(head);
      expect(graph["@context"]).toBe("https://schema.org");
      expect(Array.isArray(graph["@graph"])).toBe(true);
      expect(graph["@graph"]).toEqual(head.jsonLd);
      expect(jsonLdScripts(head.scripts)).toHaveLength(1);
    }
  });

  it("keeps the same values the og tags and description already published", () => {
    const head = pageHead({
      path: "/about",
      title: "About | AI News",
      route: INDEXABLE_ROUTE,
    });
    const page = node<
      JsonLdNode & { name: string; description: string; url: string }
    >(head, "WebPage");

    expect(page.name).toBe(metaContent(head.meta, "title"));
    expect(page.description).toBe(metaContent(head.meta, "description"));
    expect(page.url).toBe(metaContent(head.meta, "og:url"));
  });
});

describe("site_name is one constant (#224 brand resolution)", () => {
  it("resolves to the visible header brand, with no Telegram handle", () => {
    expect(SITE_NAME).toBe("AI;DR");
    expect(SITE_NAME).not.toContain(TELEGRAM_HANDLE.replace("@", ""));
    expect(SITE_NAME).not.toBe("AI News");
  });

  it("feeds og:site_name and the JSON-LD entities from that one value", () => {
    const heads = [
      homepageHead("en", {
        feed: feedWith(["aaaaaaaa"]),
        route: INDEXABLE_ROUTE,
      }),
      articleHead(STORY, "en", { route: STORY_ROUTE }),
      pageHead({ path: "/about", title: "About", route: INDEXABLE_ROUTE }),
    ];
    for (const head of heads) {
      expect(metaContent(head.meta, "og:site_name")).toBe(SITE_NAME);
      const body = jsonLdScripts(head.scripts)[0]?.children ?? "";
      // The brand appears only inside the two site-level entity names.
      for (const entity of head.jsonLd.filter((n) =>
        ["WebSite", "Organization"].includes(n["@type"])
      )) {
        expect(entity.name).toBe(SITE_NAME);
      }
      expect(body).not.toContain('"AI News"');
    }
  });

  it("keeps the site-description copy untouched by the brand resolution", () => {
    expect(SITE_DESCRIPTION).toContain("AI News (aidr.today)");
    expect(SITE_TITLE).toBe("AI News | ranked AI digest | aidr.today");
  });
});
