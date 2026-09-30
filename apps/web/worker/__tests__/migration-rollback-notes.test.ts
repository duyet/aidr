import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every migration needs a rollback note (#147). The convention is one line in
 * docs/decisions/migration-rollback.md that starts with `## ` or `- ` and
 * then the exact migration file name, e.g. `## 0031_jev_panel_verdicts.sql`.
 * A new migration cannot land without adding that line.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../../migrations");
const notesPath = path.resolve(
  here,
  "../../../../docs/decisions/migration-rollback.md"
);

const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const notes = readFileSync(notesPath, "utf8");
const documented = new Set(
  [...notes.matchAll(/^(?:## |- )(\d{4}_[\w-]+\.sql)\b/gm)].map((m) => m[1])
);

describe("migration rollback notes", () => {
  it("finds the migrations to check", () => {
    expect(migrations.length).toBeGreaterThan(30);
  });

  it.each(migrations)("%s has a rollback entry", (name) => {
    expect(
      documented.has(name),
      `add "## ${name}" or "- ${name}: ..." to docs/decisions/migration-rollback.md`
    ).toBe(true);
  });

  it("has no entry for a migration file that does not exist", () => {
    const missingFiles = [...documented].filter(
      (name) => !migrations.includes(name)
    );
    expect(missingFiles).toEqual([]);
  });
});
