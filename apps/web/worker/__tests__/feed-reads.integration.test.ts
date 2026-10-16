import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveDateOfSec } from "../../src/lib/day-archive.js";
import { stripItemDetail } from "../../src/lib/feed-fn.js";
import { getDayArchive, getFeed } from "../../src/lib/feed-queries.js";
import { dayFeedParams, homepageFeedUrl } from "../../src/lib/homepage-feed.js";
import { handleFeedXmlRequest } from "../../src/lib/rss.js";
import type { FeedResponse } from "../../src/lib/types.js";
import { Route as FeedRoute } from "../../src/routes/api/feed.js";
import { READ_DAY_CAP } from "../reads.js";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

/** D1 over node:sqlite with the real migrations, so the read join runs. */
class SqliteD1 {
  constructor(readonly db: DatabaseSync) {}

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: never[] = [];
    const prepared = {
      bind: (...next: unknown[]) => {
        args = next as never[];
        return prepared;
      },
      all: async () => ({ results: statement.all(...args) as unknown[] }),
      first: async () => statement.get(...args) ?? null,
      run: async () => {
        const result = statement.run(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return prepared;
  }

  async batch(statements: Array<{ all: () => Promise<unknown> }>) {
    const results: unknown[] = [];
    for (const statement of statements) results.push(await statement.all());
    return results as Array<{ results: unknown[] }>;
  }
}

const publishedAt = Math.floor(Date.now() / 1000) - 600;

/** Distinct 64-hex ids whose 8-hex permalink prefixes differ too. */
const storyId = (n: number) => (n + 1).toString(16).padStart(8, "0").repeat(8);

let sqlite: DatabaseSync;
let db: D1Database;

function addStory(id: string, sourceId: string, rankScore: number) {
  sqlite
    .prepare(
      `INSERT INTO items (id, source_id, url, title, published_at, fetched_at,
         points, comments, rank_score, status, tags, source_lang, category)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 'published', '[]', 'en', 'Models')`
    )
    .run(
      id,
      sourceId,
      `https://news.test/${id.slice(0, 8)}`,
      `Story ${id.slice(0, 8)}`,
      publishedAt,
      publishedAt,
      rankScore
    );
}

/** `n` stories, each from its own source, rank_score 10 falling 0.01 a place. */
function seedDay(n: number): string[] {
  const ids = Array.from({ length: n }, (_, i) => storyId(i));
  for (const [i, id] of ids.entries()) {
    addStory(id, `src-${i}`, 10 - i * 0.01);
  }
  return ids;
}

/** The most opens the read join counts: the day cap, today and yesterday. */
function maxOpens(id: string) {
  sqlite.exec(`INSERT INTO item_reads VALUES
    ('${id}', date('now'), 'web', 'open', ${READ_DAY_CAP}),
    ('${id}', date('now', '-1 day'), 'web', 'open', ${READ_DAY_CAP})`);
}

const homepageOrder = async () =>
  (await getFeed(db, { readOrder: true })).days.flatMap((d) =>
    d.items.map((i) => i.id)
  );

type Get = (args: { request: Request; context: unknown }) => Promise<Response>;
const getApiFeed = async (url: string): Promise<FeedResponse> => {
  const get = (
    FeedRoute.options.server as unknown as {
      handlers: { GET: Get };
    }
  ).handlers.GET;
  const res = await get({
    request: new Request(new URL(url, "https://aidr.today")),
    context: { env: { DB: db } },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as FeedResponse;
};

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  db = new SqliteD1(sqlite) as unknown as D1Database;
});

afterEach(() => {
  sqlite.close();
});

describe("reads reorder the homepage within a day", () => {
  it("a story 1% behind with the most countable opens passes the lead, and the count never ships", async () => {
    const [lead, wellRead] = [storyId(0), storyId(1)];
    addStory(lead, "hn", 5);
    addStory(wellRead, "techcrunch-ai", 4.95);
    maxOpens(wellRead);
    expect(await homepageOrder()).toEqual([wellRead, lead]);
    expect(
      JSON.stringify(await getFeed(db, { readOrder: true }))
    ).not.toContain("read_count");
  });

  it("outbound clicks order nothing (defect: a second beacon kind doubles one IP's drip)", async () => {
    const [lead, clicked] = [storyId(0), storyId(1)];
    addStory(lead, "hn", 5);
    addStory(clicked, "techcrunch-ai", 4.95);
    sqlite.exec(`INSERT INTO item_reads VALUES
      ('${clicked}', date('now'), 'web', 'outbound', 2000)`);
    expect(await homepageOrder()).toEqual([lead, clicked]);
  });

  it("the homepage's /api/feed calls return the SSR order (defect: a refresh or Load more reshuffles the day)", async () => {
    const ids = seedDay(40);
    maxOpens(ids[35]);
    const ssr = await homepageOrder();
    expect(ssr.indexOf(ids[35])).toBeLessThan(35);
    const date = archiveDateOfSec(publishedAt);
    if (!date) throw new Error("no archive date");
    for (const url of [
      homepageFeedUrl({ days: "3" }, "en"),
      homepageFeedUrl(dayFeedParams(date), "en"),
    ]) {
      const feed = await getApiFeed(url);
      expect(feed.days.flatMap((d) => d.items.map((i) => i.id))).toEqual(ssr);
    }
  });
});

describe("reads never reach a published surface or the API's numbers", () => {
  it("RSS keeps its first 100 stories when #101 has the most countable opens (defect: reads pick what subscribers get)", async () => {
    const ids = seedDay(120);
    const rssIds = async () => {
      const res = await handleFeedXmlRequest(
        new Request("https://aidr.today/feed.xml?lang=en"),
        db
      );
      return [
        ...(await res.text()).matchAll(/<guid[^>]*>[^<]*\/([0-9a-f]{8})\?/g),
      ].map((m) => m[1]);
    };
    const before = await rssIds();
    expect(before).toHaveLength(100);
    expect(before).not.toContain(ids[100].slice(0, 8));
    maxOpens(ids[100]);
    expect(await rssIds()).toEqual(before);
  });

  it("the homepage TL;DR fallback keeps its 16 stories when #17 is well read (defect: reads write the digest box)", async () => {
    const ids = seedDay(20);
    const bullets = async () =>
      (await getFeed(db, { readOrder: true })).tldr?.bullets_en.map(
        (b) => b.item_ids
      );
    const before = await bullets();
    expect(before).toHaveLength(16);
    maxOpens(ids[16]);
    expect(await bullets()).toEqual(before);
  });

  it("the per-source cap keeps the same story when a capped family's runner-up is well read (defect: reads pick which story the API serves)", async () => {
    const [top, runnerUp, ...others] = [0, 1, 2, 3, 4, 5].map(storyId);
    addStory(top, "fam-a", 5);
    addStory(runnerUp, "fam-a", 4.95);
    for (const [i, id] of others.entries()) {
      addStory(id, `fam-${i}`, 3 - i * 0.1);
    }
    maxOpens(runnerUp);
    for (const url of [
      "/api/feed?lang=en",
      homepageFeedUrl({ days: "3" }, "en"),
    ]) {
      const served = (await getApiFeed(url)).days.flatMap((d) =>
        d.items.map((i) => i.id)
      );
      expect(served).toContain(top);
      expect(served).not.toContain(runnerUp);
    }
  });

  it("/api/feed rank_score is the stored score, with or without order=reads (defect: the API leaks each story's read factor)", async () => {
    const ids = seedDay(5);
    maxOpens(ids[3]);
    for (const url of [
      "/api/feed?lang=en",
      homepageFeedUrl({ days: "3" }, "en"),
    ]) {
      const scores = Object.fromEntries(
        (await getApiFeed(url)).days
          .flatMap((d) => d.items)
          .map((i) => [i.id, i.rank_score])
      );
      expect(scores).toEqual(
        Object.fromEntries(ids.map((id, i) => [id, 10 - i * 0.01]))
      );
    }
  });

  it("plain /api/feed keeps stored order (defect: the extension and webmcp reorder by reads)", async () => {
    const ids = seedDay(5);
    maxOpens(ids[1]);
    const feed = await getApiFeed("/api/feed?lang=en");
    expect(feed.days.flatMap((d) => d.items.map((i) => i.id))).toEqual(ids);
  });

  it("the day archive keeps stored order (defect: reads reach the Telegram day card painted from it)", async () => {
    const [lead, wellRead] = [storyId(0), storyId(1)];
    addStory(lead, "hn", 5);
    addStory(wellRead, "techcrunch-ai", 4.95);
    maxOpens(wellRead);
    const date = archiveDateOfSec(publishedAt);
    if (!date) throw new Error("no archive date");
    const archive = await getDayArchive(db, date);
    expect(archive.day?.items.map((i) => i.id)).toEqual([lead, wellRead]);
  });
});

describe("the collapsed homepage feed computes has_detail in SQL", () => {
  interface Seed {
    summary: string | null;
    summaryEn?: { text: string; current: boolean };
    summaryVi?: string;
    sources?: number;
  }

  const cases: Array<[string, Seed, boolean]> = [
    [
      "a NULL summary with nothing else has no detail (defect: NULL counted as text)",
      { summary: null },
      false,
    ],
    [
      "an empty summary has no detail (defect: '' counted as text)",
      { summary: "" },
      false,
    ],
    [
      "a summary has detail (defect: the summary term dropped)",
      { summary: "x" },
      true,
    ],
    [
      "a current summary_en has detail (defect: enSummarySql ignored)",
      { summary: null, summaryEn: { text: "en", current: true } },
      true,
    ],
    [
      "a stale summary_en over an empty summary has no detail (defect: stale translation counted)",
      { summary: "", summaryEn: { text: "en", current: false } },
      false,
    ],
    [
      "a VI-only summary has detail (defect: the VI summary term dropped)",
      { summary: null, summaryVi: "vi summary" },
      true,
    ],
    [
      "an empty VI summary has no detail (defect: '' VI counted as text)",
      { summary: null, summaryVi: "" },
      false,
    ],
    [
      "sources alone have detail (defect: the item_sources EXISTS term dropped)",
      { summary: null, sources: 3 },
      true,
    ],
    [
      "a whitespace summary has detail, as stripItemDetail treats it (defect: SQL trims where JS does not)",
      { summary: " " },
      true,
    ],
  ];

  function seedCase(seed: Seed, n: number) {
    const id = storyId(n);
    addStory(id, `src-${n}`, 10 - n * 0.01);
    sqlite
      .prepare("UPDATE items SET summary = ? WHERE id = ?")
      .run(seed.summary, id);
    if (seed.summaryEn) {
      const { r } = sqlite
        .prepare("SELECT source_revision AS r FROM items WHERE id = ?")
        .get(id) as { r: number };
      sqlite
        .prepare(
          "UPDATE items SET summary_en = ?, summary_en_revision = ? WHERE id = ?"
        )
        .run(seed.summaryEn.text, seed.summaryEn.current ? r : r + 7, id);
    }
    if (seed.summaryVi !== undefined) {
      sqlite
        .prepare(
          "INSERT INTO translations (item_id, lang, title, summary) VALUES (?, 'vi', ?, ?)"
        )
        .run(id, `VI ${id.slice(0, 8)}`, seed.summaryVi);
    }
    for (let p = 0; p < (seed.sources ?? 0); p++) {
      sqlite
        .prepare(
          "INSERT INTO item_sources (item_id, position, kind, url) VALUES (?, ?, 'support', ?)"
        )
        .run(id, p, `https://s.test/${n}/${p}`);
    }
    return id;
  }

  it.each(cases)("%s", async (_name, seed, expected) => {
    const id = seedCase(seed, 0);
    const collapsed = await getFeed(db, { readOrder: true, detail: false });
    const item = collapsed.days
      .flatMap((d) => d.items)
      .find((i) => i.id === id);
    expect(item?.lazyDetail).toBe(expected);
  });

  it("collapsed output equals the full output stripped, with the same trending (defect: SQL and stripItemDetail disagree)", async () => {
    for (const [n, [, seed]] of cases.entries()) seedCase(seed, n);
    const full = await getFeed(db, { readOrder: true });
    const collapsed = await getFeed(db, { readOrder: true, detail: false });
    const stripped = full.days.map((d) => ({
      ...d,
      items: d.items.map(stripItemDetail),
    }));
    expect(collapsed.days).toEqual(stripped);
    expect(JSON.stringify(collapsed.days)).toBe(JSON.stringify(stripped));
    expect(collapsed.trending).toEqual(full.trending);
    expect(
      collapsed.days.flatMap((d) => d.items).map((i) => i.lazyDetail)
    ).toEqual(cases.map(([, , expected]) => expected));
  });
});
