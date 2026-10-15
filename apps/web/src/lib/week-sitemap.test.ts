/**
 * `/sitemaps/weeks.xml`: the weekly editions were reachable only through the
 * `/weeks` index, so no sitemap listed a single `/week/YYYY-Www` page.
 */
import { describe, expect, it } from "vitest";
import { expectWellFormedXml } from "./__fixtures__/xml";
import type { DbReader } from "./db";
import { SITE_URL } from "./site";
import {
  buildSitemapXml,
  loadWeekSitemapUrls,
  type SitemapWeekRow,
  weekSitemapUrls,
} from "./sitemap";

// Friday 2026-10-16 in Asia/Ho_Chi_Minh: W41 is closed, W42 is still open.
const NOW = Date.parse("2026-10-16T03:00:00Z");
const lines = (ids: string[]) =>
  JSON.stringify(ids.map((item_id) => ({ item_id, text: `line ${item_id}` })));

function row(overrides: Partial<SitemapWeekRow> = {}): SitemapWeekRow {
  return {
    week: "2026-W41",
    item_ids: JSON.stringify(["aaaaaaaa", "bbbbbbbb"]),
    stories_en: lines(["aaaaaaaa", "bbbbbbbb"]),
    stories_vi: lines(["aaaaaaaa"]),
    updated_at: Date.parse("2026-10-12T01:00:00Z"),
    ...overrides,
  };
}

describe("weekSitemapUrls", () => {
  it("lists both explicit locales of a closed week with a millisecond lastmod", () => {
    const urls = weekSitemapUrls([row()], NOW);
    expect(urls.map((u) => u.loc)).toEqual([
      `${SITE_URL}/week/2026-W41?lang=vi`,
      `${SITE_URL}/week/2026-W41?lang=en`,
    ]);
    expect(urls.every((u) => u.lastmod === "2026-10-12")).toBe(true);
    expectWellFormedXml(buildSitemapXml(urls), "weeks child");
  });

  it("omits a language with no story lines, because that page 404s", () => {
    const urls = weekSitemapUrls([row({ stories_vi: "[]" })], NOW);
    expect(urls.map((u) => u.loc)).toEqual([
      `${SITE_URL}/week/2026-W41?lang=en`,
    ]);
  });

  it("ignores lines for stories the edition does not carry", () => {
    const urls = weekSitemapUrls(
      [row({ stories_vi: lines(["cccccccc"]) })],
      NOW
    );
    expect(urls.map((u) => u.loc)).not.toContain(
      `${SITE_URL}/week/2026-W41?lang=vi`
    );
  });

  it("skips the open week and malformed keys", () => {
    const urls = weekSitemapUrls(
      [row({ week: "2026-W42" }), row({ week: "nope" }), row({ week: null })],
      NOW
    );
    expect(urls).toEqual([]);
  });
});

describe("loadWeekSitemapUrls", () => {
  it("reads weekly_snapshots", async () => {
    const sql: string[] = [];
    const db = {
      prepare(query: string) {
        sql.push(query);
        return { all: async () => ({ results: [row()] }) };
      },
    } as unknown as DbReader;
    const urls = await loadWeekSitemapUrls(db, NOW);
    expect(sql[0]).toContain("FROM weekly_snapshots");
    expect(urls).toHaveLength(2);
  });
});
