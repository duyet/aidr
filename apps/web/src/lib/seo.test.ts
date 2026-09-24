import { describe, expect, it } from "vitest";
import {
  articleHead,
  homepageHead,
  localizedPageHead,
  notFoundHead,
  pageHead,
  routeRobotsMeta,
} from "./seo";
import {
  SITE_DESCRIPTION,
  SITE_OG_HOME_IMAGE_URL,
  SITE_OG_IMAGE_URL,
  SITE_TITLE,
  SITE_URL,
} from "./site";

function metaContent(
  tags: {
    name?: string;
    property?: string;
    content?: string;
    title?: string;
  }[],
  key: string
): string | undefined {
  const hit = tags.find(
    (t) => t.name === key || t.property === key || (key === "title" && t.title)
  );
  return hit?.content ?? hit?.title;
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
    // which can 404 after ingest.
    const ogImage = `${SITE_URL}/api/og/${item.id}.png`;
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
      `${SITE_URL}/api/og/${item.id}.png`
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
});
