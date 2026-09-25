import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertAppliedMigrations,
  assertMigrationFileOrder,
  assertMigrationLedgerOrder,
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
    const files = [
      "0023_translation_reviews.sql",
      "0024_item_media_manifest.sql",
    ];
    expect(() => assertMigrationFileOrder(files)).not.toThrow();
    expect(() =>
      assertMigrationFileOrder(["0024_item_media_manifest.sql"])
    ).toThrow(/0023/);
    expect(() =>
      assertAppliedMigrations(
        [
          { id: 1, name: "0023_translation_reviews.sql" },
          { id: 2, name: "0024_item_media_manifest.sql" },
        ],
        files
      )
    ).not.toThrow();
    expect(() => assertAppliedMigrations([])).toThrow(/0023/);
  });

  it("rejects an out-of-order migration ledger", () => {
    const files = [
      "0023_translation_reviews.sql",
      "0024_item_media_manifest.sql",
    ];
    const rows = [
      { id: 2, name: "0024_item_media_manifest.sql" },
      { id: 1, name: "0023_translation_reviews.sql" },
    ];
    expect(() => assertAppliedMigrations(rows, files)).toThrow(/order/);
    expect(() => assertMigrationLedgerOrder(rows, files)).toThrow(/order/);
    expect(() =>
      assertMigrationLedgerOrder(
        [{ id: 1, name: "0024_item_media_manifest.sql" }],
        files
      )
    ).toThrow(/order/);
  });

  it("rejects duplicate or malformed ledger ids", () => {
    const files = [
      "0023_translation_reviews.sql",
      "0024_item_media_manifest.sql",
    ];
    expect(() =>
      assertAppliedMigrations(
        [
          { id: 1, name: "0023_translation_reviews.sql" },
          { id: 1, name: "0024_item_media_manifest.sql" },
        ],
        files
      )
    ).toThrow(/ids/);
    expect(() =>
      assertAppliedMigrations(
        [
          { id: 1, name: "0023_translation_reviews.sql" },
          { id: Number.NaN, name: "0024_item_media_manifest.sql" },
        ],
        files
      )
    ).toThrow(/invalid ledger/);
  });
});
