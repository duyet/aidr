import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dayArchivePath, dayBoundsSec } from "./day-archive";
import type { DbReader } from "./db";
import { stripItemDetail } from "./feed-fn";
import {
  boundFeedResponse,
  FEED_RESPONSE_MAX_BYTES,
  getFeed,
} from "./feed-queries";
import type { FeedResponse } from "./types";

const here = dirname(fileURLToPath(import.meta.url));

describe("boundFeedResponse", () => {
  it("enforces a total serialized budget for a hostile feed payload", () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      id: `id-${i}`,
      url: `https://example.com/${i}`,
      title: "t".repeat(2_000),
      title_vi: "v".repeat(2_000),
      summary: "s".repeat(20_000),
      summary_vi: "s".repeat(20_000),
      category: "category",
      published_at: 1_700_000_000 + i,
      points: 1,
      comments: 1,
      rank_score: 1,
      source_id: "source",
      tags: Array.from({ length: 100 }, (_, j) => `tag-${j}`),
      sources: Array.from({ length: 100 }, (_, j) => ({
        kind: "source" as const,
        author: "a",
        posted_at: 1,
        quote: "q".repeat(2_000),
        url: `https://source.example/${j}`,
      })),
      llm_tokens: 0,
      image_url: `https://img.example/${i}.jpg`,
      media_manifest: {
        version: 1 as const,
        assets: [
          { type: "image" as const, url: `https://img.example/${i}.jpg` },
        ],
      },
    }));
    const feed: FeedResponse = {
      tldr: null,
      days: [
        {
          date: "2026-08-27",
          items,
          categoryCounts: { category: items.length },
        },
      ],
      categories: [{ name: "category", count: items.length }],
      trending: [],
      totalStories: items.length,
      updatedAt: 1,
      lastFetchedAt: 1,
      hasMore: true,
    };

    const bounded = boundFeedResponse(feed);
    expect(
      new TextEncoder().encode(JSON.stringify(bounded)).length
    ).toBeLessThanOrEqual(FEED_RESPONSE_MAX_BYTES);
    expect(bounded.totalStories).toBe(items.length);
  }, 20_000);
});

describe("feed hydration state", () => {
  it("does not mutate highlight state while producing an SSR feed", () => {
    const source = readFileSync(join(here, "feed-queries.ts"), "utf8");

    expect(source).not.toContain("setLearnedKeywords(learnedKeywords);");
  });
});

interface Prepared {
  sql: string;
  binds: unknown[];
}

/** Returns the rows the caller supplies. The day key and the `before`
 * binds are what this fixture is for; it does not apply the SQL window.
 * `sources` answers the item_sources chunk statements, unfiltered. */
function fakeFeedDb(
  items: Record<string, unknown>[],
  sources: Record<string, unknown>[] = []
) {
  const prepared: Prepared[] = [];
  const resultFor = (sql: string) => {
    // The sources statement embeds the item query, so test it first.
    if (sql.includes("FROM item_sources\n")) return { results: sources };
    if (sql.includes("FROM items i")) return { results: items };
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
  return { db: db as unknown as DbReader, prepared };
}

function story(id: string, publishedIso: string) {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Story ${id}`,
    title_vi: null,
    summary: null,
    summary_vi: null,
    category: "models",
    published_at: Date.parse(publishedIso) / 1000,
    points: 0,
    comments: 0,
    rank_score: 1,
    source_id: "hn",
    tags: "[]",
  };
}

describe("feed audience day", () => {
  it("puts a 19:00 UTC story on the ICT day its Full day link opens", async () => {
    // 19:00 UTC is 02:00 the next morning in Asia/Ho_Chi_Minh. 16:00 UTC
    // is still 23:00 the same calendar day, so the bucket is the audience
    // midnight, not a one-day shift of every UTC date.
    const { db } = fakeFeedDb([
      story("evening19", "2026-10-03T19:00:00Z"),
      story("stillthird", "2026-10-03T16:00:00Z"),
    ]);

    const feed = await getFeed(db);
    const evening = feed.days.find((day) =>
      day.items.some((item) => item.id === "evening19")
    );
    const earlier = feed.days.find((day) =>
      day.items.some((item) => item.id === "stillthird")
    );

    expect(evening?.date).toBe("2026-10-04");
    expect(dayArchivePath(evening?.date ?? "")).toBe("/date/2026-10-04");
    expect(earlier?.date).toBe("2026-10-03");
  });

  it("ends a `before` page at the ICT midnight of that audience day", async () => {
    const { db, prepared } = fakeFeedDb([]);
    await getFeed(db, { before: "2026-10-04", days: 3 });

    const start = dayBoundsSec("2026-10-04").start;
    const itemsSql = prepared.find((entry) =>
      entry.sql.includes("FROM items i")
    );
    expect(itemsSql?.binds.slice(0, 2)).toEqual([start - 3 * 86_400, start]);
  });
});

const SOURCE_CHUNK_SQL = "FROM item_sources\n";

function detailFixture() {
  const withSummary = {
    ...story("summarised", "2026-10-03T10:00:00Z"),
    summary: "An English summary",
    has_detail: 1,
    source_count: 0,
  };
  const withSources = {
    ...story("sourced", "2026-10-03T11:00:00Z"),
    has_detail: 1,
    source_count: 2,
  };
  const bare = {
    ...story("bare", "2026-10-03T12:00:00Z"),
    has_detail: 0,
    source_count: 0,
  };
  const sources = [
    {
      item_id: "sourced",
      kind: "support",
      author: "a",
      posted_at: 1,
      quote: "q",
      url: "https://source.example/1",
    },
    {
      item_id: "sourced",
      kind: "discussion",
      author: null,
      posted_at: null,
      quote: null,
      url: null,
    },
  ];
  return { rows: [withSummary, withSources, bare], sources };
}

describe("collapsed feed rows (detail: false)", () => {
  it("moves no summaries or sources out of D1 and flags lazyDetail from has_detail", async () => {
    const { rows, sources } = detailFixture();
    const { db, prepared } = fakeFeedDb(rows, sources);

    const feed = await getFeed(db, { detail: false });

    const itemsSql = prepared.find((entry) =>
      entry.sql.includes("FROM items i")
    );
    expect(itemsSql?.sql).not.toContain("END AS summary,");
    expect(itemsSql?.sql).not.toContain("t.summary AS summary_vi");
    expect(itemsSql?.sql).toContain("NULL AS summary, NULL AS summary_vi");
    expect(prepared.some((entry) => entry.sql.includes(SOURCE_CHUNK_SQL))).toBe(
      false
    );
    const byId = new Map(
      feed.days.flatMap((day) => day.items).map((item) => [item.id, item])
    );
    for (const item of byId.values()) {
      expect(item.summary).toBeNull();
      expect(item.summary_vi).toBeNull();
      expect(item.sources).toEqual([]);
    }
    expect(byId.get("summarised")?.lazyDetail).toBe(true);
    expect(byId.get("sourced")?.lazyDetail).toBe(true);
    expect(byId.get("bare")?.lazyDetail).toBe(false);
  });

  it("equals the full feed after stripItemDetail, item for item", async () => {
    const { rows, sources } = detailFixture();
    const fullRows = rows.map(
      ({ has_detail: _flag, source_count: _count, ...row }) => row
    );

    const collapsed = await getFeed(fakeFeedDb(rows, sources).db, {
      detail: false,
    });
    const full = await getFeed(fakeFeedDb(fullRows, sources).db);
    const stripped = full.days.map((day) => ({
      ...day,
      items: day.items.map(stripItemDetail),
    }));

    expect(
      full.days[0]?.items.find((i) => i.id === "sourced")?.sources
    ).toHaveLength(2);
    expect(collapsed.days).toEqual(stripped);
    expect(
      collapsed.days.map((day) => day.items.map((item) => Object.keys(item)))
    ).toEqual(
      stripped.map((day) => day.items.map((item) => Object.keys(item)))
    );
  });

  it("weights trending by source_count instead of the sources it no longer loads", async () => {
    const recent = new Date(Date.now() - 3_600_000).toISOString();
    const { db } = fakeFeedDb([
      {
        ...story("one", recent),
        tags: JSON.stringify(["Mistral Large 3"]),
        has_detail: 0,
        source_count: 0,
      },
      {
        ...story("four", recent),
        tags: JSON.stringify(["Gemini 4"]),
        has_detail: 1,
        source_count: 4,
      },
    ]);

    const feed = await getFeed(db, { detail: false });

    expect(feed.trending[0]).toEqual({ tag: "Gemini 4", count: 4 });
    expect(feed.trending[1]?.count).toBe(1);
  });

  it("keeps loading sources for the default full feed", async () => {
    const { rows, sources } = detailFixture();
    const { db, prepared } = fakeFeedDb(rows, sources);

    const feed = await getFeed(db);

    expect(prepared.some((entry) => entry.sql.includes(SOURCE_CHUNK_SQL))).toBe(
      true
    );
    const sourced = feed.days
      .flatMap((day) => day.items)
      .find((item) => item.id === "sourced");
    expect(sourced?.sources).toHaveLength(2);
    expect(sourced?.lazyDetail).toBeUndefined();
  });
});
