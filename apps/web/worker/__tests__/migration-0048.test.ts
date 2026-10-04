import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(dirname, "../../migrations");
const sql = readFileSync(
  path.join(migrationsDir, "0048_items_read_indexes.sql"),
  "utf8"
);

const RANK_JOIN = `SELECT duplicate_of AS canonical_id,
       json_group_array(json_array(source_id, points, comments, url)) AS members
FROM items WHERE status = 'merged' GROUP BY duplicate_of`;

describe("migration 0048_items_read_indexes", () => {
  it("adds the three read indexes from the public-read pass", () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_items_status_published_at\s+ON items \(status, published_at DESC\);/
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_items_status_fetched_at\s+ON items \(status, fetched_at DESC\);/
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_items_merged_members\s+ON items \(duplicate_of, source_id, points, comments, url\)\s+WHERE status = 'merged';/
    );
    expect(sql).not.toContain("idx_items_status_duplicate_of");
    expect(sql).not.toContain("idx_items_published_at");
    expect(sql).not.toContain("rank_score");
  });

  it("plans the feed window, published max fetched_at, and the merged join", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(readFileSync(path.join(migrationsDir, "0001_init.sql"), "utf8"));
      db.exec(
        readFileSync(path.join(migrationsDir, "0005_duplicate_of.sql"), "utf8")
      );
      db.exec(sql);
      const insert = db.prepare(
        `INSERT INTO items (id, source_id, url, title, published_at, fetched_at, points, comments, status, duplicate_of)
         VALUES (?, 'hn', ?, 't', ?, ?, ?, ?, ?, ?)`
      );
      db.exec("BEGIN");
      for (let i = 0; i < 40; i++) {
        insert.run(
          `m${i}`,
          `https://example.com/m${i}`,
          1_700_000_000 + i,
          1_700_000_000 + i,
          i % 5,
          i % 3,
          "merged",
          `c${i % 8}`
        );
      }
      for (let i = 0; i < 20; i++) {
        insert.run(
          `p${i}`,
          `https://example.com/p${i}`,
          1_750_000_000 + i,
          1_750_000_000 + i,
          1,
          1,
          "published",
          null
        );
      }
      db.exec("COMMIT");
      db.exec("ANALYZE");

      const plan = (query: string) =>
        db
          .prepare(`EXPLAIN QUERY PLAN ${query}`)
          .all()
          .map((row) => (row as { detail: string }).detail)
          .join("\n");

      expect(
        plan(
          `SELECT id FROM items
           WHERE status = 'published' AND published_at >= 1 AND published_at < 2
           ORDER BY published_at DESC LIMIT 500`
        )
      ).toContain("idx_items_status_published_at");
      expect(
        plan(
          "SELECT MAX(fetched_at) AS last FROM items WHERE status = 'published'"
        )
      ).toContain("idx_items_status_fetched_at");
      expect(
        plan(
          "SELECT MAX(published_at) AS at FROM items WHERE status = 'published' AND published_at < 1"
        )
      ).toContain("idx_items_status_published_at");
      // The join predicate is exactly status = 'merged', grouping duplicate_of
      // and the same four member columns the partial index stores.
      expect(plan(RANK_JOIN)).toContain("idx_items_merged_members");
    } finally {
      db.close();
    }
  });
});
