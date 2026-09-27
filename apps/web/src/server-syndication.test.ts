/**
 * Worker-level contract for the new syndication surfaces: the RSS document,
 * the sitemap index and its children, the news sitemap, and the thin
 * `/feed.json` alias. The locale behaviour is asserted against the same
 * matrix the issue documents for `/api/feed` (bare, `?lang=`, `?locale=`,
 * invalid, repeated, conflicting).
 */
import handler from "@tanstack/react-start/server-entry";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../worker/types";
import { expectWellFormedXml } from "./lib/__fixtures__/xml";

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: vi.fn(async () => new Response("{}", { status: 200 })) },
}));
vi.mock("../worker/ingest-schedule", () => ({
  ensureIngestAlarm: vi.fn(),
  tickIngest: vi.fn(),
}));
vi.mock("../worker/ingest-scheduler", () => ({
  NewsIngestScheduler: class {},
}));
vi.mock("../worker/workflow", () => ({ NewsIngestWorkflow: class {} }));

const { default: server } = await import("./server");

const PUBLISHED_AT = 1_787_000_000;

interface ItemRow {
  id: string;
  url: string;
  title: string;
  title_vi: string | null;
  summary: string | null;
  summary_vi: string | null;
  category: string | null;
  published_at: number;
  points: number;
  comments: number;
  rank_score: number;
  source_id: string;
  tags: string;
  llm_tokens?: number;
  image_url?: string | null;
  media_manifest?: string | null;
}

function itemRows(): ItemRow[] {
  return [
    {
      id: "a1b2c3d4".padEnd(64, "0"),
      url: "https://news.ycombinator.com/item?id=1",
      title: "OpenAI ships a faster reasoning model",
      title_vi: "OpenAI ra mắt mô hình suy luận nhanh hơn",
      summary: "English summary & details.",
      summary_vi: "Tóm tắt tiếng Việt & chi tiết.",
      category: "Models",
      published_at: PUBLISHED_AT,
      points: 120,
      comments: 30,
      rank_score: 42,
      source_id: "hn",
      tags: '["openai","gpt-6"]',
      image_url: "https://images.example.com/photo.jpg",
    },
    {
      id: "ffff1111".padEnd(64, "0"),
      url: "https://news.ycombinator.com/item?id=2",
      title: "Untranslated story stays English",
      title_vi: null,
      summary: "Only English text exists.",
      summary_vi: null,
      category: "Research",
      published_at: PUBLISHED_AT - 3_600,
      points: 10,
      comments: 1,
      rank_score: 9,
      source_id: "hn",
      tags: '["research"]',
      image_url: null,
    },
  ];
}

interface Stmt {
  sql: string;
  values: unknown[];
  bind(...values: unknown[]): Stmt;
  all(): Promise<{ results: unknown[] }>;
  run(): Promise<{ success: boolean }>;
}

function fakeDb(
  options: { items?: ItemRow[]; failOn?: RegExp } = {}
): D1Database {
  const items = options.items ?? itemRows();
  const dispatch = (sql: string): unknown[] => {
    if (options.failOn?.test(sql)) throw new Error("D1 unavailable");
    if (sql.includes("item_sources")) return [];
    if (sql.includes("learned_keywords")) return [];
    if (sql.includes("topic_daily")) return [];
    if (sql.includes("tldr_snapshots")) return [];
    if (sql.includes("MAX(fetched_at)")) return [{ last: PUBLISHED_AT }];
    if (sql.includes("SELECT 1 AS yes")) return [];
    if (sql.includes("GROUP BY category"))
      return [{ name: "Models", count: 1 }];
    if (sql.includes("COUNT(*) AS count"))
      return [{ month: "2026-08", count: 2, newest: PUBLISHED_AT }];
    if (sql.includes("FROM items i")) return items;
    return [];
  };
  const prepare = (sql: string): Stmt => {
    const stmt: Stmt = {
      sql,
      values: [],
      bind(...values: unknown[]) {
        stmt.values = values;
        return stmt;
      },
      all: async () => ({ results: dispatch(sql) }),
      run: async () => ({ success: true }),
    };
    return stmt;
  };
  return {
    prepare,
    batch: async (stmts: Stmt[]) =>
      stmts.map((stmt) => ({ results: dispatch(stmt.sql), success: true })),
  } as unknown as D1Database;
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://aidr.today${path}`, init);
}

async function fetchPath(
  path: string,
  init: RequestInit = {},
  env: Env = { DB: fakeDb() } as unknown as Env
): Promise<Response> {
  const result = server.fetch(request(path, init), env);
  return result instanceof Promise ? result : Promise.resolve(result);
}

describe("/feed.xml locale contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves an explicit locale as a public, cacheable, valid RSS document", async () => {
    const vi = await fetchPath("/feed.xml?lang=vi");
    expect(vi.status).toBe(200);
    expect(vi.headers.get("content-type")).toBe(
      "application/rss+xml; charset=utf-8"
    );
    expect(vi.headers.get("cache-control")).toContain("public");
    expect(vi.headers.get("vary")).toBeNull();
    expect(vi.headers.get("content-language")).toBe("vi");
    expect(vi.headers.get("x-robots-tag")).toBe("index, follow");
    const viXml = await vi.text();
    expectWellFormedXml(viXml, "feed.xml?lang=vi");
    expect(viXml).toContain(
      '<atom:link rel="self" type="application/rss+xml; charset=utf-8" href="https://aidr.today/feed.xml?lang=vi" />'
    );
    expect(viXml).toContain(
      "<title>OpenAI ra mắt mô hình suy luận nhanh hơn</title>"
    );
    expect(viXml).toContain(
      "<description>Tóm tắt tiếng Việt &amp; chi tiết.</description>"
    );

    const en = await fetchPath("/feed.xml?lang=en");
    expect(en.status).toBe(200);
    expect(en.headers.get("cache-control")).toContain("public");
    expect(en.headers.get("content-language")).toBe("en");
    const enXml = await en.text();
    expectWellFormedXml(enXml, "feed.xml?lang=en");
    expect(enXml).toContain(
      "<title>OpenAI ships a faster reasoning model</title>"
    );
    expect(enXml).toContain(
      '<atom:link rel="self" type="application/rss+xml; charset=utf-8" href="https://aidr.today/feed.xml?lang=en" />'
    );
  });

  it("keeps a bare request private and cookie/Accept-Language selected", async () => {
    const response = await fetchPath("/feed.xml", {
      headers: { cookie: "news_lang=en" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie, Accept-Language");
    expect(response.headers.get("content-language")).toBe("en");
    const xml = await response.text();
    expectWellFormedXml(xml, "bare feed.xml");
    expect(xml).toContain('?lang=en" />');
  });

  it("redirects one legacy locale to lang exactly once", async () => {
    const response = await fetchPath("/feed.xml?locale=vi");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://aidr.today/feed.xml?lang=vi"
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie, Accept-Language");
  });

  it("rejects invalid, repeated, and conflicting locale values with 400 JSON", async () => {
    for (const search of [
      "?lang=xx",
      "?lang=vi&lang=en",
      "?lang=vi&locale=vi",
    ]) {
      const response = await fetchPath(`/feed.xml${search}`);
      expect(response.status, search).toBe(400);
      expect(response.headers.get("content-language"), search).toBe("en, vi");
      expect(response.headers.get("cache-control"), search).toBe(
        "private, no-store"
      );
      expect(response.headers.get("vary"), search).toContain("Accept-Language");
      expect(response.headers.get("x-robots-tag"), search).toBe(
        "noindex, nofollow"
      );
    }
  });

  it("serves the identical document at the /rss.xml alias", async () => {
    const [canonical, alias] = await Promise.all([
      fetchPath("/feed.xml?lang=vi"),
      fetchPath("/rss.xml?lang=vi"),
    ]);
    expect(alias.status).toBe(200);
    expect(alias.headers.get("content-type")).toBe(
      "application/rss+xml; charset=utf-8"
    );
    expect(await alias.text()).toBe(await canonical.text());
  });

  it("emits only canonical explicit-locale item links", async () => {
    const response = await fetchPath("/feed.xml?lang=vi");
    const xml = await response.text();
    const links = [...xml.matchAll(/<link>([^<]*)<\/link>/g)].map((m) => m[1]);
    expect(links[0]).toBe("https://aidr.today/?lang=vi");
    for (const link of links.slice(1)) {
      expect(link, link).toMatch(
        /^https:\/\/aidr\.today\/[0-9a-f]{8}\?lang=(vi|en)$/
      );
    }
    const guids = [...xml.matchAll(/<guid isPermaLink="true">([^<]*)</g)].map(
      (m) => m[1]
    );
    expect(guids).toEqual(links.slice(1));
  });

  it("fails with 503 when the D1 binding is missing, like /api/feed does", async () => {
    const response = await fetchPath("/feed.xml?lang=vi", {}, {} as Env);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-language")).toBe("en, vi");
  });
});

describe("/feed.json alias", () => {
  it("delegates to the existing /api/feed route without a new format", async () => {
    vi.mocked(handler.fetch).mockClear();
    const response = await fetchPath("/feed.json?lang=en&days=2");
    expect(response.status).toBe(200);
    expect(vi.mocked(handler.fetch)).toHaveBeenCalledTimes(1);
    const forwarded = vi.mocked(handler.fetch).mock.calls[0]?.[0] as Request;
    const url = new URL(forwarded.url);
    expect(url.pathname).toBe("/api/feed");
    expect(url.searchParams.get("lang")).toBe("en");
    expect(url.searchParams.get("days")).toBe("2");
  });

  it("uses the same locale gate as /api/feed", async () => {
    const legacy = await fetchPath("/feed.json?locale=en");
    expect(legacy.status).toBe(307);
    expect(legacy.headers.get("location")).toBe(
      "https://aidr.today/feed.json?lang=en"
    );
    const invalid = await fetchPath("/feed.json?lang=xx");
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("content-language")).toBe("en, vi");
    expect(invalid.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("sitemap index and children", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves /sitemap.xml as a valid sitemapindex", async () => {
    const response = await fetchPath("/sitemap.xml");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/xml/);
    const xml = await response.text();
    expectWellFormedXml(xml, "sitemap.xml");
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("<loc>https://aidr.today/sitemaps/static.xml</loc>");
    expect(xml).toContain(
      "<loc>https://aidr.today/sitemaps/sitemap-2026-08.xml</loc>"
    );
    expect(xml).toContain("<loc>https://aidr.today/news.xml</loc>");
  });

  it("serves the static child with a lastmod on every loc", async () => {
    const response = await fetchPath("/sitemaps/static.xml");
    expect(response.status).toBe(200);
    const xml = await response.text();
    expectWellFormedXml(xml, "static child");
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].length;
    const lastmods = [...xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].length;
    expect(locs).toBeGreaterThan(0);
    expect(lastmods).toBe(locs);
  });

  it("serves a month child with both story locales and an image", async () => {
    const response = await fetchPath("/sitemaps/sitemap-2026-08.xml");
    expect(response.status).toBe(200);
    const xml = await response.text();
    expectWellFormedXml(xml, "month child");
    expect(xml).toContain("<loc>https://aidr.today/a1b2c3d4?lang=vi</loc>");
    expect(xml).toContain("<loc>https://aidr.today/a1b2c3d4?lang=en</loc>");
    expect(xml).toContain("<image:loc>https://aidr.today/api/og/");
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].length;
    const lastmods = [...xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].length;
    expect(lastmods).toBe(locs);
  });

  it("fails closed to valid static-only XML when a child loader throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await fetchPath("/sitemaps/sitemap-2026-08.xml", {}, {
      DB: fakeDb({ failOn: /FROM items i/ }),
    } as unknown as Env);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/xml/);
    const xml = await response.text();
    expectWellFormedXml(xml, "child fallback");
    expect(xml).toContain("<loc>https://aidr.today/about</loc>");
    expect(xml).not.toContain("a1b2c3d4");
  });

  it("fails closed to a valid index when the month-count query throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await fetchPath("/sitemap.xml", {}, {
      DB: fakeDb({ failOn: /COUNT\(\*\) AS count/ }),
    } as unknown as Env);
    expect(response.status).toBe(200);
    const xml = await response.text();
    expectWellFormedXml(xml, "index fallback");
    expect(xml).toContain("<sitemapindex");
    expect(xml).toContain("<loc>https://aidr.today/sitemaps/static.xml</loc>");
  });
});

describe("news sitemap", () => {
  it("serves a valid news sitemap bounded to 1,000 entries", async () => {
    const response = await fetchPath("/news.xml");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/xml/);
    const xml = await response.text();
    expectWellFormedXml(xml, "news.xml");
    expect(xml).toContain(
      'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"'
    );
    expect(xml).toContain("<news:name>AI News</news:name>");
    expect([...xml.matchAll(/<news:news>/g)].length).toBeLessThanOrEqual(1000);
    expect(
      /<news:publication_date>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00<\/news:publication_date>/.test(
        xml
      )
    ).toBe(true);
    expect(xml).toContain("<news:language>vi</news:language>");
    expect(xml).toContain("<news:language>en</news:language>");
  });
});
