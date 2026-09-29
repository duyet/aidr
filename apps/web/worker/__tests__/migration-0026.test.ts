import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLERK_USERS_MIGRATION } from "../clerk-users.js";
import {
  assertAppliedMigrations,
  assertMigrationFileOrder,
} from "../migration-gate.js";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);
const sql = readFileSync(
  path.join(migrationsDir, CLERK_USERS_MIGRATION),
  "utf8"
);

describe("migration 0026_clerk_users", () => {
  it("mirrors Clerk accounts with a soft-delete column and no destructive DDL", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS clerk_users");
    expect(sql).toMatch(/id\s+TEXT PRIMARY KEY/);
    expect(sql).toMatch(/email\s+TEXT/);
    expect(sql).toMatch(/created_at\s+INTEGER NOT NULL/);
    expect(sql).toMatch(/updated_at\s+INTEGER NOT NULL/);
    expect(sql).toMatch(/deleted_at\s+INTEGER/);
    expect(sql).toContain("idx_clerk_users_created_at");
    expect(sql).toContain("idx_clerk_users_email");
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    // The table starts empty on purpose: rows only come from a verified
    // webhook or an explicit backfill, never from a guessed backfill.
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
  });

  it("applies cleanly and counts only live accounts", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(sql);
      db.exec(`
        INSERT INTO clerk_users (id, email, created_at, updated_at, deleted_at)
        VALUES ('user_live', 'live@example.com', 10, 10, NULL);
        INSERT INTO clerk_users (id, email, created_at, updated_at, deleted_at)
        VALUES ('user_gone', 'gone@example.com', 20, 30, 30);
      `);

      expect(
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM clerk_users WHERE deleted_at IS NULL"
          )
          .get()
      ).toEqual({ c: 1 });

      // Replaying the same file must stay a no-op for an applied ledger.
      expect(() => db.exec(sql)).not.toThrow();
    } finally {
      db.close();
    }
  });

  it("is ordered after 0025 and keeps the ledger gate honest", () => {
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    expect(files).toContain(CLERK_USERS_MIGRATION);
    expect(() => assertMigrationFileOrder(files)).not.toThrow();

    const applied = files.map((name, index) => ({ id: index + 1, name }));

    // A fully applied ledger passes the pre-deploy gate.
    expect(() => assertAppliedMigrations(applied, files)).not.toThrow();

    // 0026 is conditionally required: once its file ships, a ledger without
    // it must fail loudly rather than serving /api/system/accounts from a
    // table that does not exist.
    expect(() =>
      assertAppliedMigrations(
        applied.filter((row) => row.name !== CLERK_USERS_MIGRATION),
        files
      )
    ).toThrow(CLERK_USERS_MIGRATION);

    // Without the file in the checkout the gate is a no-op for 0026, so
    // sibling branches that do not ship it keep their existing behaviour.
    expect(() =>
      assertAppliedMigrations(
        applied.filter((row) => row.name !== CLERK_USERS_MIGRATION),
        applied
          .filter((row) => row.name !== CLERK_USERS_MIGRATION)
          .map((row) => row.name)
      )
    ).not.toThrow();

    // Pre-existing requirements still win when the ledger is short: a ledger
    // with only 0023 applied is rejected on 0024, not on 0026.
    expect(() =>
      assertAppliedMigrations(
        [{ id: 1, name: "0023_translation_reviews.sql" }],
        files
      )
    ).toThrow("0024_item_media_manifest.sql");
  });
});
