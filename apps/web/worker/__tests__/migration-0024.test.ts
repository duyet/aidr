import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertAppliedMigrations,
  assertMigrationFileOrder,
} from "../migration-gate.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(dirname, "../../migrations/0024_item_media_manifest.sql"),
  "utf-8"
);

describe("migration 0024_item_media_manifest", () => {
  it("adds an additive bounded manifest column without replacing image_url", () => {
    expect(sql).toContain(
      "ALTER TABLE items ADD COLUMN media_manifest TEXT NOT NULL DEFAULT '[]';"
    );
    expect(sql).toContain("image_url");
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("DELETE FROM");
  });

  it("upgrades a pre-0024 items table and preserves its legacy row", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY,
          image_url TEXT
        );
        INSERT INTO items (id, image_url)
        VALUES ('legacy', 'https://img.example/legacy.jpg');
      `);
      expect(() =>
        db.prepare("SELECT media_manifest FROM items LIMIT 1").get()
      ).toThrow();

      db.exec(sql);
      const row = db
        .prepare("SELECT id, image_url, media_manifest FROM items")
        .get() as {
        id: string;
        image_url: string;
        media_manifest: string;
      };
      expect(row).toEqual({
        id: "legacy",
        image_url: "https://img.example/legacy.jpg",
        media_manifest: "[]",
      });
    } finally {
      db.close();
    }
  });

  it("fails the migration gate until 0023 is ordered before 0024", () => {
    expect(() =>
      assertMigrationFileOrder([
        "0023_translation_reviews.sql",
        "0024_item_media_manifest.sql",
      ])
    ).not.toThrow();
    expect(() =>
      assertMigrationFileOrder(["0024_item_media_manifest.sql"])
    ).toThrow(/0023/);
    expect(() =>
      assertAppliedMigrations([
        { name: "0023_translation_reviews.sql" },
        { name: "0024_item_media_manifest.sql" },
      ])
    ).not.toThrow();
    expect(() => assertAppliedMigrations([])).toThrow(/0023/);
  });
});
