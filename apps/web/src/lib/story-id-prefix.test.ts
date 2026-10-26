import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { DbReader } from "./db";
import { getStory, idPrefixBinds, idPrefixPredicate } from "./story-queries";

/**
 * Story lookups run on every permalink, `.md` and `/api/story` hit. With a
 * bare `substr(id, 1, n) = ?` SQLite cannot use an index, so each lookup
 * scanned all of `items` and `item_sources`: about 70% of the D1 rows read
 * in production (2026-10). These tests pin the index seek and the exact
 * prefix semantics the permalink contract depends on.
 */
function seed() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE items (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE item_sources (item_id TEXT, position INTEGER);
    CREATE INDEX idx_item_sources_item ON item_sources (item_id);`);
  const ids = [
    "967c32f3".padEnd(64, "a"),
    "967c32f4".padEnd(64, "b"),
    "967c32f3".padEnd(64, "c"),
    "00000000".padEnd(64, "0"),
  ];
  for (const id of ids) {
    sqlite.prepare("INSERT INTO items VALUES (?, 'published')").run(id);
    sqlite.prepare("INSERT INTO item_sources VALUES (?, 0)").run(id);
  }
  return { sqlite, ids };
}

describe("idPrefixPredicate", () => {
  it("seeks the index instead of scanning the table", () => {
    const { sqlite } = seed();
    for (const [table, col] of [
      ["items", "id"],
      ["item_sources", "item_id"],
    ]) {
      const plan = sqlite
        .prepare(
          `EXPLAIN QUERY PLAN SELECT * FROM ${table} WHERE ${idPrefixPredicate(col)}`
        )
        .all(...idPrefixBinds("967c32f3"))
        .map((r) => String((r as { detail: string }).detail))
        .join("\n");
      expect(plan).toMatch(/SEARCH .*USING .*INDEX/);
      expect(plan).not.toMatch(/^SCAN/m);
    }
  });

  it("matches exactly the ids that start with the prefix", () => {
    const { sqlite, ids } = seed();
    const rows = (prefix: string) =>
      sqlite
        .prepare(
          `SELECT id FROM items WHERE ${idPrefixPredicate("id")} ORDER BY id`
        )
        .all(...idPrefixBinds(prefix))
        .map((r) => (r as { id: string }).id);
    expect(rows("967c32f3")).toEqual([ids[0], ids[2]]);
    expect(rows(ids[1])).toEqual([ids[1]]);
    expect(rows("967c32f")).toHaveLength(3);
    expect(rows("deadbeef")).toEqual([]);
  });
});

/**
 * Beside `status = ?`, SQLite picks `idx_items_status_fetched_at` over the id
 * range and walks every published row: 5,961 rows and 22 ms of D1 time per
 * story lookup in production (2026-10-26), against 33 rows with the range.
 * This runs the real getStory SQL on the full migrated schema and reads the
 * plan of every statement.
 */
describe("getStory query plans", () => {
  function migratedDb() {
    const sqlite = new DatabaseSync(":memory:");
    const dir = path.resolve(import.meta.dirname, "../../migrations");
    for (const name of readdirSync(dir)
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      sqlite.exec(readFileSync(path.join(dir, name), "utf8"));
    }
    const insert = sqlite.prepare(
      `INSERT INTO items (id, source_id, url, title, published_at, fetched_at,
         rank_score, status, duplicate_of)
       VALUES (?, 'hn', ?, ?, 1700000000, 1700000000, 1, ?, ?)`
    );
    const live = "967c32f3".padEnd(64, "a");
    insert.run(live, "https://example.com/live", "live", "published", null);
    insert.run(
      "5e1f0d2c".padEnd(64, "b"),
      "https://example.com/merged",
      "merged",
      "merged",
      live
    );
    const plans: string[] = [];
    const prepare = (sql: string) => {
      let args: unknown[] = [];
      const stmt = {
        bind: (...bound: unknown[]) => {
          args = bound;
          return stmt;
        },
        all: async () => {
          plans.push(
            sqlite
              .prepare(`EXPLAIN QUERY PLAN ${sql}`)
              .all(...(args as never[]))
              .map((row) => String((row as { detail: string }).detail))
              .join("\n")
          );
          return { results: sqlite.prepare(sql).all(...(args as never[])) };
        },
      };
      return stmt;
    };
    const db = {
      prepare,
      batch: async (stmts: { all: () => Promise<unknown> }[]) =>
        Promise.all(stmts.map((stmt) => stmt.all())),
    } as unknown as DbReader;
    return { db, plans, live };
  }

  it("seeks the items id index for published and merged ids", async () => {
    const { db, plans, live } = migratedDb();
    expect((await getStory(db, "967c32f3"))?.id).toBe(live);
    expect((await getStory(db, "5e1f0d2c"))?.id).toBe(live);
    const itemPlans = plans.filter((plan) => / items\b| i USING/.test(plan));
    expect(itemPlans.length).toBeGreaterThan(0);
    for (const plan of itemPlans) {
      expect(plan).not.toContain("idx_items_status");
      expect(plan).toMatch(
        /USING INDEX sqlite_autoindex_items_1 \(id>\? AND id<\?\)/
      );
    }
  });
});
