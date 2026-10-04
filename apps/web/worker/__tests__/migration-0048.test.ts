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

describe("migration 0048_items_read_indexes", () => {
  it("adds the three read indexes and no partial index", () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_items_status_published_at\s+ON items \(status, published_at DESC\);/
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_items_status_fetched_at\s+ON items \(status, fetched_at DESC\);/
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_items_status_duplicate_of\s+ON items \(status, duplicate_of\);/
    );
    expect(sql).not.toMatch(/CREATE INDEX[^;]*\bWHERE\b/i);
  });

  it("is the plan for the feed, freshness, and merged-cluster reads", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(readFileSync(path.join(migrationsDir, "0001_init.sql"), "utf8"));
      db.exec(
        readFileSync(path.join(migrationsDir, "0005_duplicate_of.sql"), "utf8")
      );
      db.exec(sql);
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
          "SELECT id FROM items WHERE status = 'merged' AND duplicate_of = 'c'"
        )
      ).toContain("idx_items_status_duplicate_of");
    } finally {
      db.close();
    }
  });
});
