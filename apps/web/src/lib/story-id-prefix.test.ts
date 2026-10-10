import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { idPrefixBinds, idPrefixPredicate } from "./story-queries";

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
