import { describe, expect, it } from "vitest";
import { AUDIENCE_TIMEZONE, localCalendarDate } from "../../worker/time.js";
import {
  archiveDateOfSec,
  DAY_ARCHIVE_RECENT_CACHE_CONTROL,
  DAY_ARCHIVE_SETTLED_CACHE_CONTROL,
  dayArchiveCacheControl,
  dayArchivePath,
  dayBoundsSec,
  parseArchiveDate,
} from "./day-archive";
import { DAY_ARCHIVE_ITEM_LIMIT, getDayArchive } from "./feed-queries";

// 2026-10-02 18:00 UTC = 2026-10-03 01:00 in Asia/Ho_Chi_Minh.
const EVENING_UTC = Date.parse("2026-10-02T18:00:00Z");
const MORNING_UTC = Date.parse("2026-10-02T03:00:00Z");

describe("parseArchiveDate", () => {
  it("accepts real past and current days", () => {
    expect(parseArchiveDate("2026-10-01", MORNING_UTC)).toBe("2026-10-01");
    expect(parseArchiveDate("2026-10-02", MORNING_UTC)).toBe("2026-10-02");
  });

  it("treats today as the ICT date, which the homepage TL;DR links to", () => {
    // The snapshot is keyed by the ICT date; in the UTC evening that is
    // already tomorrow in UTC terms, and its link must not 404.
    expect(parseArchiveDate("2026-10-03", EVENING_UTC)).toBe("2026-10-03");
    expect(parseArchiveDate("2026-10-03", MORNING_UTC)).toBeNull();
    expect(parseArchiveDate("2026-10-04", EVENING_UTC)).toBeNull();
  });

  it("rejects malformed and impossible dates", () => {
    for (const raw of [
      "2026-02-30",
      "2026-13-01",
      "2026-1-01",
      "20261001",
      "2026-10-01x",
      "deadbeef",
      "",
    ]) {
      expect(parseArchiveDate(raw, MORNING_UTC), raw).toBeNull();
    }
    expect(parseArchiveDate(undefined, MORNING_UTC)).toBeNull();
  });
});

describe("day archive helpers", () => {
  it("spans the audience-zone day that keys tldr_snapshots", () => {
    // The digest on the page is the snapshot stored under this ICT date, so
    // the story list must cover the same ICT midnight-to-midnight window.
    for (const date of ["2026-10-02", "2026-01-01", "2026-06-15"]) {
      const { start, end } = dayBoundsSec(date);
      expect(end - start).toBe(86_400);
      expect(localCalendarDate(start * 1000, AUDIENCE_TIMEZONE)).toBe(date);
      expect(localCalendarDate((end - 1) * 1000, AUDIENCE_TIMEZONE)).toBe(date);
      expect(localCalendarDate((start - 1) * 1000, AUDIENCE_TIMEZONE)).not.toBe(
        date
      );
      expect(archiveDateOfSec(start)).toBe(date);
    }
  });

  it("builds locale-aware paths", () => {
    expect(dayArchivePath("2026-10-02")).toBe("/date/2026-10-02");
    expect(dayArchivePath("2026-10-02", "en")).toBe("/date/2026-10-02?lang=en");
  });

  it("caches settled days long and recent days briefly", () => {
    // Ranks can still move for 72h after publish (ALGORITHM.md §7).
    expect(dayArchiveCacheControl("2026-09-20", MORNING_UTC)).toBe(
      DAY_ARCHIVE_SETTLED_CACHE_CONTROL
    );
    expect(dayArchiveCacheControl("2026-09-30", MORNING_UTC)).toBe(
      DAY_ARCHIVE_RECENT_CACHE_CONTROL
    );
    expect(dayArchiveCacheControl("2026-10-02", MORNING_UTC)).toBe(
      DAY_ARCHIVE_RECENT_CACHE_CONTROL
    );
  });
});

interface Prepared {
  sql: string;
  binds: unknown[];
}

function fakeDb(rows: {
  items?: Record<string, unknown>[];
  tldr?: Record<string, unknown> | null;
  prevAt?: number | null;
  nextAt?: number | null;
  video?: Record<string, unknown> | null;
  videoThrows?: boolean;
}) {
  const prepared: Prepared[] = [];
  const resultFor = (sql: string) => {
    if (sql.includes("FROM tldr_snapshots"))
      return { results: rows.tldr ? [rows.tldr] : [] };
    if (sql.includes("MAX(published_at)"))
      return { results: [{ at: rows.prevAt ?? null }] };
    if (sql.includes("MIN(published_at)"))
      return { results: [{ at: rows.nextAt ?? null }] };
    if (sql.includes("FROM items i")) return { results: rows.items ?? [] };
    return { results: [] };
  };
  const db = {
    prepare(sql: string) {
      const entry: Prepared = { sql, binds: [] };
      prepared.push(entry);
      const stmt = {
        bind(...binds: unknown[]) {
          entry.binds = binds;
          return stmt;
        },
        async all() {
          return resultFor(sql);
        },
        async first() {
          if (sql.includes("FROM day_videos")) {
            if (rows.videoThrows) throw new Error("no such table: day_videos");
            return rows.video ?? null;
          }
          return null;
        },
        async run() {
          return { success: true };
        },
        sql,
      };
      return stmt;
    },
    async batch(stmts: { sql: string }[]) {
      return stmts.map((s) => resultFor(s.sql));
    },
  };
  return { db: db as unknown as D1Database, prepared };
}

function item(id: string, publishedIso: string, rank: number) {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Story ${id}`,
    title_vi: `Tin ${id}`,
    summary: null,
    summary_vi: null,
    category: "models",
    published_at: Date.parse(publishedIso) / 1000,
    points: 0,
    comments: 0,
    rank_score: rank,
    source_id: "hn",
    tags: "[]",
  };
}

describe("getDayArchive", () => {
  it("lists the ICT day's stories by rank with the same-date snapshot and neighbours", async () => {
    const { db, prepared } = fakeDb({
      // Both fall on 2026-10-02 in ICT though they straddle UTC midnight;
      // they must stay one ranked group, not be split per UTC day.
      items: [
        item("aaaaaaaa1111", "2026-10-01T18:00:00Z", 2),
        item("bbbbbbbb2222", "2026-10-02T10:00:00Z", 9),
      ],
      tldr: {
        date: "2026-10-02",
        bullets_en: JSON.stringify([
          { text: "English bullet", item_ids: ["bbbbbbbb2222"] },
        ]),
        bullets_vi: JSON.stringify([
          { text: "Bản tin tiếng Việt", item_ids: ["bbbbbbbb2222"] },
        ]),
      },
      prevAt: Date.parse("2026-09-30T12:00:00Z") / 1000,
      // 18:30 UTC on Oct 2 is already Oct 3 in ICT.
      nextAt: Date.parse("2026-10-02T18:30:00Z") / 1000,
      video: { youtube_id: "B3vKYiV7rOw", short_id: "fStNAQhJo3M", title: " " },
    });

    const archive = await getDayArchive(db, "2026-10-02");

    expect(archive.day?.date).toBe("2026-10-02");
    expect(archive.day?.categoryCounts).toEqual({ models: 2 });
    expect(archive.day?.items.map((i) => i.id)).toEqual([
      "bbbbbbbb2222",
      "aaaaaaaa1111",
    ]);
    // Both language columns survive as stored — no fallback between them.
    expect(archive.tldr?.bullets_en[0]?.text).toBe("English bullet");
    expect(archive.tldr?.bullets_vi[0]?.text).toBe("Bản tin tiếng Việt");
    expect(archive.prevDate).toBe("2026-09-30");
    expect(archive.nextDate).toBe("2026-10-03");
    expect(archive.video).toEqual({
      youtube_id: "B3vKYiV7rOw",
      short_id: "fStNAQhJo3M",
      title: null,
    });

    const itemsSql = prepared.find((p) => p.sql.includes("FROM items i"));
    expect(itemsSql?.binds).toEqual([
      Date.parse("2026-10-01T17:00:00Z") / 1000,
      Date.parse("2026-10-02T17:00:00Z") / 1000,
    ]);
    expect(itemsSql?.sql).toContain(`LIMIT ${DAY_ARCHIVE_ITEM_LIMIT}`);
    expect(
      prepared.find((p) => p.sql.includes("FROM tldr_snapshots"))?.binds
    ).toEqual(["2026-10-02"]);
  });

  it("never writes, unlike the live feed's snapshot rebuild", async () => {
    // getFeed persists a rebuilt TL;DR under today's date; an archive read of
    // an old day must not overwrite today's edition.
    const { db, prepared } = fakeDb({
      items: [item("aaaaaaaa1111", "2026-10-02T01:00:00Z", 1)],
      tldr: null,
    });
    await getDayArchive(db, "2026-10-02");
    for (const { sql } of prepared) {
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE)\b/i);
    }
  });

  it("returns an empty day (the route's 404) and tolerates a missing video table", async () => {
    const { db } = fakeDb({ items: [], tldr: null, videoThrows: true });
    const archive = await getDayArchive(db, "2026-10-02");
    expect(archive.day).toBeNull();
    expect(archive.tldr).toBeNull();
    expect(archive.video).toBeNull();
    expect(archive.prevDate).toBeNull();
  });

  it("drops a stored video id that is not a valid YouTube id", async () => {
    const { db } = fakeDb({
      video: { youtube_id: "javascript:x", short_id: null, title: "t" },
    });
    expect((await getDayArchive(db, "2026-10-02")).video).toBeNull();
  });
});
