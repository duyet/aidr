import {
  MEDIA_MANIFEST_MIGRATION,
  TRANSLATION_REVIEW_MIGRATION,
} from "./media-schema.js";

export const REQUIRED_MIGRATIONS = [
  TRANSLATION_REVIEW_MIGRATION,
  MEDIA_MANIFEST_MIGRATION,
] as const;

function migrationNumber(name: string): number {
  const match = name.match(/^(\d+)_/);
  return match ? Number.parseInt(match[1], 10) : Number.NaN;
}

export function assertMigrationFileOrder(files: readonly string[]): void {
  const available = new Set(files);
  for (const required of REQUIRED_MIGRATIONS) {
    if (!available.has(required)) {
      throw new Error(`missing required migration ${required}`);
    }
  }
  const first = migrationNumber(REQUIRED_MIGRATIONS[0]);
  const second = migrationNumber(REQUIRED_MIGRATIONS[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second) || first >= second) {
    throw new Error("migration order must be 0023 before 0024");
  }
}

export function assertAppliedMigrations(rows: unknown): void {
  if (!Array.isArray(rows)) {
    throw new Error("migration probe did not return an array");
  }
  const names = new Set(
    rows
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const value = (row as { name?: unknown }).name;
        return typeof value === "string" ? value : null;
      })
      .filter((name): name is string => name !== null)
  );
  for (const required of REQUIRED_MIGRATIONS) {
    if (!names.has(required)) {
      throw new Error(`required migration is not applied: ${required}`);
    }
  }
}

export function parseWranglerMigrationOutput(output: string): unknown {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end <= start) {
    throw new Error("could not parse Wrangler migration JSON");
  }
  return JSON.parse(output.slice(start, end + 1));
}
