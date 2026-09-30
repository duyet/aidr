import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MEDIA_MANIFEST_MIGRATION,
  RUN_IDENTITY_MIGRATION,
  TRANSLATION_REVIEW_HARDENING_MIGRATION,
  TRANSLATION_REVIEW_MIGRATION,
} from "../media-schema.js";
import {
  assertMigrationFileOrder,
  assertNoObsoleteMigrations,
  formatMigrationRange,
  requiredMigrationsForFiles,
} from "../migration-gate.js";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);
const repositoryMigrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

function migrationNumber(name: string): number {
  const match = /^(\d+)_/.exec(name);
  return match ? Number.parseInt(match[1], 10) : Number.NaN;
}

describe("migration gate expected set", () => {
  it("derives the verified set from the migrations directory", () => {
    expect(repositoryMigrations).toContain(RUN_IDENTITY_MIGRATION);
    expect(repositoryMigrations).not.toContain(
      TRANSLATION_REVIEW_HARDENING_MIGRATION
    );

    const fromDirectory = repositoryMigrations
      .filter((name) => migrationNumber(name) >= 23)
      .sort(
        (a, b) => migrationNumber(a) - migrationNumber(b) || a.localeCompare(b)
      );
    const expected = [
      TRANSLATION_REVIEW_MIGRATION,
      MEDIA_MANIFEST_MIGRATION,
      ...fromDirectory.filter(
        (name) =>
          name !== TRANSLATION_REVIEW_MIGRATION &&
          name !== MEDIA_MANIFEST_MIGRATION
      ),
    ];

    expect(requiredMigrationsForFiles(repositoryMigrations)).toEqual(expected);
    expect(expected).toContain(RUN_IDENTITY_MIGRATION);
    expect(expected).not.toContain(TRANSLATION_REVIEW_HARDENING_MIGRATION);
    expect(formatMigrationRange(repositoryMigrations)).toBe(
      expected.map((name) => name.slice(0, 4)).join(" -> ")
    );
    expect(() => assertMigrationFileOrder(repositoryMigrations)).not.toThrow();
  });

  it("hard-fails if the obsolete 0025 filename is reintroduced", () => {
    const resurrected = [
      ...repositoryMigrations,
      TRANSLATION_REVIEW_HARDENING_MIGRATION,
    ];
    expect(() => assertNoObsoleteMigrations(resurrected)).toThrow(
      /0025_translation_review_hardening\.sql/
    );
    expect(() => requiredMigrationsForFiles(resurrected)).toThrow(
      /0025_translation_review_hardening\.sql/
    );
    expect(() => assertMigrationFileOrder(resurrected)).toThrow(
      /0025_translation_review_hardening\.sql/
    );
    expect(() =>
      assertNoObsoleteMigrations(repositoryMigrations)
    ).not.toThrow();
  });

  it("does not invent a migration that is absent from the checkout", () => {
    const partial = [TRANSLATION_REVIEW_MIGRATION, MEDIA_MANIFEST_MIGRATION];
    expect(requiredMigrationsForFiles(partial)).toEqual(partial);
    expect(formatMigrationRange(partial)).toBe("0023 -> 0024");
    expect(requiredMigrationsForFiles(partial)).not.toContain(
      RUN_IDENTITY_MIGRATION
    );
    expect(() => assertMigrationFileOrder(partial)).not.toThrow();
  });

  it("includes the real 0025 file when that file is present", () => {
    const files = [
      TRANSLATION_REVIEW_MIGRATION,
      MEDIA_MANIFEST_MIGRATION,
      RUN_IDENTITY_MIGRATION,
    ];
    expect(requiredMigrationsForFiles(files)).toEqual(files);
    expect(formatMigrationRange(files)).toBe("0023 -> 0024 -> 0025");
  });
});
