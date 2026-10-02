/**
 * `/sitemaps/days.xml`: every `/date/YYYY-MM-DD` page a crawler can reach.
 * The page exists when a day has a published story or a stored digest, so the
 * child lists exactly those days, in both explicit locales.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectWellFormedXml } from "./__fixtures__/xml";
import type { DbReader } from "./db";
import { SITE_URL } from "./site";
import {
  buildSitemapXml,
  daySitemapUrls,
  loadDaySitemapUrls,
  SITEMAP_DAY_LIMIT,
  safeSitemapResponse,
} from "./sitemap";

// 2026-10-03 10:00 in Asia/Ho_Chi_Minh.
const NOW = Date.parse("2026-10-03T03:00:00Z");
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("daySitemapUrls", () => {
  it("lists both explicit locales per day", () => {
    const urls = daySitemapUrls(
      [{ date: "2026-10-02", updated: sec("2026-10-02T05:00:00Z") }],
      [],
      NOW
    );
    expect(urls.map((u) => u.loc)).toEqual([
      `${SITE_URL}/date/2026-10-02?lang=vi`,
      `${SITE_URL}/date/2026-10-02?lang=en`,
    ]);
    expect(urls.every((u) => u.lastmod === "2026-10-02")).toBe(true);
  });

  it("marks recent days daily and settled days monthly", () => {
    const [recent, , settled] = daySitemapUrls(
      [
        { date: "2026-10-02", updated: sec("2026-10-02T05:00:00Z") },
        { date: "2026-08-01", updated: sec("2026-08-01T05:00:00Z") },
      ],
      [],
      NOW
    );
    // Ranks move for 72h, so a recent page really does change hourly.
    expect(recent?.changefreq).toBe("daily");
    expect(settled?.changefreq).toBe("monthly");
    expect(Number(recent?.priority)).toBeGreaterThan(Number(settled?.priority));
  });

  it("puts the YouTube thumbnail on the vi entry only and lets the video move lastmod", () => {
    const [viUrl, enUrl] = daySitemapUrls(
      [{ date: "2026-08-01", updated: sec("2026-08-01T05:00:00Z") }],
      [
        {
          date: "2026-08-01",
          youtube_id: "dQw4w9WgXcQ",
          short_id: "abcdefghijk",
          title: "AI;DR <Daily> & brief",
          // day_videos writes milliseconds.
          updated_at: Date.parse("2026-08-05T00:00:00Z"),
        },
      ],
      NOW
    );
    expect(viUrl?.image).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    );
    expect(viUrl?.imageTitle).toBe("AI;DR <Daily> & brief");
    expect(viUrl?.lastmod).toBe("2026-08-05");
    expect(enUrl?.image).toBeUndefined();
    const xml = buildSitemapXml([viUrl!, enUrl!]);
    expectWellFormedXml(xml, "days child with image");
    expect(xml).toContain('xmlns:image="');
  });

  it("falls back to the Short thumbnail and drops invalid video ids", () => {
    const [withShort] = daySitemapUrls(
      [{ date: "2026-08-01", updated: 1 }],
      [
        {
          date: "2026-08-01",
          youtube_id: "bad id",
          short_id: "abcdefghijk",
          title: null,
          updated_at: null,
        },
      ],
      NOW
    );
    expect(withShort?.image).toBe(
      "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"
    );
    const [noImage] = daySitemapUrls(
      [{ date: "2026-08-02", updated: 1 }],
      [
        {
          date: "2026-08-02",
          youtube_id: "javascript:",
          short_id: null,
          title: "x",
          updated_at: null,
        },
      ],
      NOW
    );
    expect(noImage?.image).toBeUndefined();
  });

  it("skips malformed and future dates (the page would 404)", () => {
    const urls = daySitemapUrls(
      [
        { date: null, updated: 1 },
        { date: "2026-13", updated: 1 },
        { date: "2026-10-04", updated: 1 },
        { date: "2026-10-03", updated: 1 },
      ],
      [],
      NOW
    );
    expect(urls.map((u) => u.loc)).toEqual([
      `${SITE_URL}/date/2026-10-03?lang=vi`,
      `${SITE_URL}/date/2026-10-03?lang=en`,
    ]);
  });
});

describe("loadDaySitemapUrls", () => {
  afterEach(() => vi.restoreAllMocks());

  function fakeDb(
    dayRows: unknown[],
    videos: unknown[] | Error,
    sql: string[] = [],
    binds: unknown[][] = []
  ): DbReader {
    return {
      prepare(query: string) {
        sql.push(query);
        const run = async () => {
          if (query.includes("day_videos")) {
            if (videos instanceof Error) throw videos;
            return { results: videos };
          }
          return { results: dayRows };
        };
        return {
          bind: (...args: unknown[]) => {
            binds.push(args);
            return { all: run };
          },
          all: run,
        };
      },
    } as unknown as DbReader;
  }

  it("unions story days and digest days in the audience zone, bounded", async () => {
    const sql: string[] = [];
    const binds: unknown[][] = [];
    await loadDaySitemapUrls(fakeDb([], [], sql, binds), NOW);
    expect(sql[0]).toContain("'+7 hours'");
    expect(sql[0]).toContain("tldr_snapshots");
    expect(sql[0]).toContain("status = 'published'");
    expect(binds[0]).toEqual([SITEMAP_DAY_LIMIT]);
  });

  it("still lists days when day_videos is not migrated", async () => {
    const urls = await loadDaySitemapUrls(
      fakeDb(
        [{ date: "2026-10-01", updated: 1 }],
        new Error("no such table: day_videos")
      ),
      NOW
    );
    expect(urls).toHaveLength(2);
    expect(urls[0]?.image).toBeUndefined();
  });

  it("serves 200 valid XML when D1 fails (fail-closed)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await safeSitemapResponse(async () => {
      throw new Error("D1 unavailable");
    });
    expect(response.status).toBe(200);
    expectWellFormedXml(await response.text(), "days fallback");
  });
});
