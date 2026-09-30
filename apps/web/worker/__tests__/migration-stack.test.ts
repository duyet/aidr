import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertMigrationFileOrder } from "../migration-gate.js";

// Quality gate (#147): per-migration tests only cover the files someone wrote
// a test for. This one applies the whole `migrations/` directory, in the order
// D1 applies it, to an empty database. A new migration that references a
// missing table/column, has a syntax error, or collides with an earlier file
// fails here in CI instead of at `d1:migrate` against production.

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

function tableNames(db: DatabaseSync): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

describe("full D1 migration stack", () => {
  it("has files in a strict, gap-free order", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(() => assertMigrationFileOrder(files)).not.toThrow();
  });

  it("applies every migration in order to an empty database", () => {
    const db = new DatabaseSync(":memory:");
    try {
      for (const file of files) {
        const sql = readFileSync(path.join(migrationsDir, file), "utf8");
        try {
          db.exec(sql);
        } catch (error) {
          throw new Error(
            `${file} failed on top of the earlier migrations: ${(error as Error).message}`
          );
        }
      }
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(db.prepare("PRAGMA integrity_check").get()).toEqual({
        integrity_check: "ok",
      });
      // Core pipeline tables must survive the whole stack. A later migration
      // that drops or renames one would break ingest/publish silently.
      expect(tableNames(db)).toEqual(
        expect.arrayContaining(["items", "tldr_snapshots", "subscribers"])
      );
    } finally {
      db.close();
    }
  });
});
