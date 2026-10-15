import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveDateOfSec } from "../../src/lib/day-archive.js";
import { getDayArchive, getFeed } from "../../src/lib/feed-queries.js";

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

const LEAD = "a".repeat(64);
const WELL_READ = "b".repeat(64);
const publishedAt = Math.floor(Date.now() / 1000) - 600;

let sqlite: DatabaseSync;
let db: D1Database;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  const add = sqlite.prepare(
    `INSERT INTO items (id, source_id, url, title, published_at, fetched_at,
       points, comments, rank_score, status, tags, source_lang, category)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 'published', '[]', 'en', 'Models')`
  );
  add.run(LEAD, "hn", "https://a.test/1", "Lead", publishedAt, publishedAt, 5);
  add.run(
    WELL_READ,
    "techcrunch-ai",
    "https://b.test/2",
    "Well read",
    publishedAt,
    publishedAt,
    4.9
  );
  sqlite.exec(`INSERT INTO item_reads VALUES
    ('${WELL_READ}', date('now'), 'web', 'open', 100)`);
  db = new SqliteD1(sqlite) as unknown as D1Database;
});

afterEach(() => {
  sqlite.close();
});

describe("reads reorder the homepage feed and nothing published", () => {
  it("the homepage puts a well-read story 2% behind ahead of the lead, and never sends the count", async () => {
    const feed = await getFeed(db);
    expect(feed.days[0]?.items.map((i) => i.id)).toEqual([WELL_READ, LEAD]);
    expect(JSON.stringify(feed)).not.toContain("read_count");
  });

  it("the day archive keeps stored order (defect: reads reach the Telegram day card painted from it)", async () => {
    const date = archiveDateOfSec(publishedAt);
    if (!date) throw new Error("no archive date");
    const archive = await getDayArchive(db, date);
    expect(archive.day?.items.map((i) => i.id)).toEqual([LEAD, WELL_READ]);
  });
});
