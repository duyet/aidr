/**
 * The sitemap index and its date-sharded children. Kept in its own file (not
 * `sitemap.test.ts`) because the flat-sitemap assertions there describe the
 * pre-index shape that this change replaces.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectWellFormedXml } from "./__fixtures__/xml";
import type { DbReader } from "./db";
import { SITE_URL } from "./site";
import {
  buildSitemapIndexXml,
  buildSitemapXml,
  loadSitemapShardUrls,
  parseSitemapShardPath,
  SITEMAP_SHARD_ITEM_LIMIT,
  safeSitemapIndexResponse,
  safeSitemapResponse,
  sitemapIndexEntries,
  sitemapLastmod,
  sitemapShardParts,
  sitemapShardPath,
  staticSitemapUrls,
  storySitemapImage,
  storySitemapUrls,
} from "./sitemap";

const GENERATED = Date.parse("2026-09-27T00:00:00Z");

describe("sitemapLastmod", () => {
  it("normalizes milliseconds and rejects unusable values", () => {
    expect(sitemapLastmod(1_787_000_000)).toBe("2026-08-17");
    expect(sitemapLastmod(1_787_000_000_000)).toBe("2026-08-17");
    expect(sitemapLastmod(0)).toBeUndefined();
    expect(sitemapLastmod(null)).toBeUndefined();
    expect(sitemapLastmod(Number.NaN)).toBeUndefined();
  });
});

describe("static sitemap child", () => {
  it("emits a lastmod for every static loc", () => {
    const xml = buildSitemapXml(staticSitemapUrls(GENERATED));
    expectWellFormedXml(xml, "static child");
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    const lastmods = [...xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map(
      (m) => m[1]
    );
    expect(locs.length).toBeGreaterThan(0);
    expect(lastmods.length).toBe(locs.length);
    expect(new Set(lastmods)).toEqual(new Set(["2026-09-27"]));
  });

  it("stays byte-identical to the pre-index urlset when no image is used", () => {
    const xml = buildSitemapXml(staticSitemapUrls());
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    );
    expect(xml).not.toContain("xmlns:image");
    expect(xml).not.toContain("<image:image>");
  });
});

describe("story sitemap urls", () => {
  const story = {
    id: "abcdef12deadbeef",
    category: "Models",
    published_at: 1_787_000_000,
  };

  it("emits both explicit locales with an image on the default locale", () => {
    const [vi, en] = storySitemapUrls(story);
    expect(vi?.loc).toBe(`${SITE_URL}/abcdef12?lang=vi`);
    expect(en?.loc).toBe(`${SITE_URL}/abcdef12?lang=en`);
    expect(vi?.image).toBe(storySitemapImage("abcdef12deadbeef"));
    expect(vi?.image).toBe(`${SITE_URL}/api/og/abcdef12deadbeef.png?lang=vi`);
    expect(en?.image).toBeUndefined();
  });

  it("uses the newest of published_at and a later stored update as lastmod", () => {
    const corrected = {
      ...story,
      published_at: 1_787_000_000,
      updated_at: 1_790_000_000,
    };
    expect(storySitemapUrls(story)[0]?.lastmod).toBe("2026-08-17");
    expect(storySitemapUrls(corrected)[0]?.lastmod).toBe("2026-09-21");
    // A stale update marker never pulls lastmod backwards.
    const older = { ...story, updated_at: 1_700_000_000 };
    expect(storySitemapUrls(older)[0]?.lastmod).toBe("2026-08-17");
  });

  it("renders image:image only when an entry has one", () => {
    const withImage = buildSitemapXml(storySitemapUrls(story));
    expectWellFormedXml(withImage, "shard child");
    expect(withImage).toContain(
      'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
    );
    expect(withImage).toContain(
      `<image:loc>${SITE_URL}/api/og/abcdef12deadbeef.png?lang=vi</image:loc>`
    );
    const without = buildSitemapXml([
      { loc: `${SITE_URL}/about`, lastmod: "2026-09-27" },
    ]);
    expect(without).not.toContain("<image:image>");
  });
});

describe("shard paths and parts", () => {
  it("splits a month at the documented item cap", () => {
    expect(sitemapShardParts(0)).toBe(0);
    expect(sitemapShardParts(1)).toBe(1);
    expect(sitemapShardParts(SITEMAP_SHARD_ITEM_LIMIT)).toBe(1);
    expect(sitemapShardParts(SITEMAP_SHARD_ITEM_LIMIT + 1)).toBe(2);
    expect(sitemapShardParts(SITEMAP_SHARD_ITEM_LIMIT * 3)).toBe(3);
  });

  it("round-trips a shard path", () => {
    expect(sitemapShardPath({ month: "2026-08", part: 1 })).toBe(
      "/sitemaps/sitemap-2026-08.xml"
    );
    expect(sitemapShardPath({ month: "2026-08", part: 2 })).toBe(
      "/sitemaps/sitemap-2026-08-2.xml"
    );
    expect(parseSitemapShardPath("/sitemaps/sitemap-2026-08.xml")).toEqual({
      month: "2026-08",
      part: 1,
    });
    expect(parseSitemapShardPath("/sitemaps/sitemap-2026-08-12.xml")).toEqual({
      month: "2026-08",
      part: 12,
    });
  });

  it("rejects anything that is not a shard child", () => {
    for (const path of [
      "/sitemaps/static.xml",
      "/sitemaps/sitemap-2026-8.xml",
      "/sitemaps/sitemap-2026-08.xml/extra",
      "/sitemaps/sitemap-2026-08-0.xml",
      "/sitemaps/sitemap-2026-08-1000.xml",
      "/sitemap.xml",
      "/news.xml",
      "/sitemaps/../sitemap.xml",
    ]) {
      expect(parseSitemapShardPath(path), path).toBeNull();
    }
  });
});

describe("sitemap index", () => {
  const months = [
    { month: "2026-09", count: 250, newest: 1_790_000_000 },
    {
      month: "2026-08",
      count: SITEMAP_SHARD_ITEM_LIMIT * 2 + 5,
      newest: 1_787_000_000,
    },
    { month: null, count: 0, newest: null },
  ];

  it("lists the static child, every month shard, and the news sitemap", () => {
    const xml = buildSitemapIndexXml(sitemapIndexEntries(months, GENERATED));
    expectWellFormedXml(xml, "sitemap index");
    expect(xml).toContain("<sitemapindex");
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs[0]).toBe(`${SITE_URL}/sitemaps/static.xml`);
    expect(locs[1]).toBe(`${SITE_URL}/sitemaps/sitemap-2026-09.xml`);
    expect(locs).toContain(`${SITE_URL}/sitemaps/sitemap-2026-08-3.xml`);
    expect(locs[locs.length - 1]).toBe(`${SITE_URL}/news.xml`);
    // A month above the cap contributes every part, so nothing is unreachable.
    expect(locs.filter((loc) => loc.includes("2026-08")).length).toBe(3);
    // No self-cap: the archive is covered by months, not by a LIMIT 1000.
    expect(locs).not.toContain(`${SITE_URL}/?lang=vi`);
  });

  it("emits a lastmod for every child and a valid index with no months", () => {
    const xml = buildSitemapIndexXml(sitemapIndexEntries([], GENERATED));
    expectWellFormedXml(xml, "empty index");
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    const lastmods = [...xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map(
      (m) => m[1]
    );
    expect(locs).toHaveLength(2);
    expect(lastmods).toHaveLength(locs.length);
  });

  it("stays 200 valid XML when the month-count loader fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await safeSitemapIndexResponse(async () => {
      throw new Error("D1 unavailable");
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/xml/);
    const xml = await response.text();
    expectWellFormedXml(xml, "index fallback");
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain(`${SITE_URL}/sitemaps/static.xml`);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("shard child loading", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fakeDb(rows: unknown[], calls: string[] = []): DbReader {
    return {
      prepare(sql: string) {
        calls.push(sql);
        const statement = {
          bind: () => ({ all: async () => ({ results: rows }) }),
          all: async () => ({ results: rows }),
        };
        return statement as unknown as D1PreparedStatement;
      },
      batch: async () => [],
    } as unknown as DbReader;
  }

  it("reads one month of rows with a limit/offset window", async () => {
    const calls: string[] = [];
    const db = fakeDb(
      [
        {
          id: "abcdef12deadbeef",
          category: "Models",
          published_at: 1_787_000_000,
          updated_at: 1_787_000_500,
        },
      ],
      calls
    );
    const urls = await loadSitemapShardUrls(db, { month: "2026-08", part: 2 });
    expect(urls).toHaveLength(2);
    expect(urls[0]?.loc).toBe(`${SITE_URL}/abcdef12?lang=vi`);
    expect(urls[1]?.loc).toBe(`${SITE_URL}/abcdef12?lang=en`);
    expect(calls[0]).toContain("strftime('%Y-%m'");
    expect(calls[0]).toContain("translations");
    expect(calls[0]).toContain("LIMIT ? OFFSET ?");
  });

  it("fails closed to a valid static-only document on a loader error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await safeSitemapResponse(async () => {
      throw new Error("D1 unavailable");
    });
    expect(response.status).toBe(200);
    const xml = await response.text();
    expectWellFormedXml(xml, "child fallback");
    expect(xml).toContain(`<loc>${SITE_URL}/about</loc>`);
    expect(xml).not.toContain("<image:image>");
  });
});
