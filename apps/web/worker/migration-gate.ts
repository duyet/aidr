import {
  MEDIA_MANIFEST_MIGRATION,
  TRANSLATION_REVIEW_HARDENING_MIGRATION,
  TRANSLATION_REVIEW_MIGRATION,
} from "./media-schema.js";

/** Ordered migrations required by this branch. 0025 is owned by #158 and is
 * included only when its file is present in the combined checkout. */
export const REQUIRED_MIGRATIONS = [
  TRANSLATION_REVIEW_MIGRATION,
  MEDIA_MANIFEST_MIGRATION,
] as const;

function migrationNumber(name: string): number {
  const match = name.match(/^(\d+)_/);
  return match ? Number.parseInt(match[1], 10) : Number.NaN;
}

function compareMigrationNames(a: string, b: string): number {
  return migrationNumber(a) - migrationNumber(b) || a.localeCompare(b);
}

export function requiredMigrationsForFiles(
  files: readonly string[] = []
): string[] {
  const available = new Set(files);
  return [
    ...REQUIRED_MIGRATIONS,
    ...(available.has(TRANSLATION_REVIEW_HARDENING_MIGRATION)
      ? [TRANSLATION_REVIEW_HARDENING_MIGRATION]
      : []),
  ];
}

function assertOrder(
  names: readonly string[],
  label: string,
  allowEqual = false
): void {
  let previous = Number.NEGATIVE_INFINITY;
  for (const name of names) {
    const number = migrationNumber(name);
    if (!Number.isFinite(number)) {
      throw new Error(`${label} has an invalid migration name: ${name}`);
    }
    if (allowEqual ? number < previous : number <= previous) {
      throw new Error(`${label} must be in numeric order: ${name}`);
    }
    previous = number;
  }
}

/** Validate the migration filenames before Wrangler is allowed to apply them. */
export function assertMigrationFileOrder(files: readonly string[]): void {
  const available = new Set(files);
  if (available.size !== files.length) {
    throw new Error("migration file order contains duplicate filenames");
  }
  for (const file of files) {
    if (!Number.isFinite(migrationNumber(file))) {
      throw new Error(
        `migration file order has an invalid migration name: ${file}`
      );
    }
  }
  const required = requiredMigrationsForFiles(files);
  for (const migration of required) {
    if (!available.has(migration)) {
      throw new Error(`missing required migration ${migration}`);
    }
  }

  // The filesystem's readdir order is not an ordering contract. Wrangler
  // orders filenames lexically, so validate that canonical sequence instead.
  const orderedFiles = [...files].sort(compareMigrationNames);
  assertOrder(orderedFiles, "migration file order", true);
  const positions = new Map(orderedFiles.map((name, index) => [name, index]));
  let previous = Number.NEGATIVE_INFINITY;
  for (const migration of required) {
    const position = positions.get(migration);
    if (position === undefined || position <= previous) {
      throw new Error("required migration order must be 0023, 0024, then 0025");
    }
    previous = position;
  }
}

interface LedgerEntry {
  name: string;
  id: number | null;
}

function ledgerEntries(rows: unknown): LedgerEntry[] {
  if (!Array.isArray(rows)) {
    throw new Error("migration probe did not return an array");
  }
  const entries = rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as { id?: unknown; name?: unknown };
      if (typeof record.name !== "string") return null;
      const rawId =
        typeof record.id === "number"
          ? record.id
          : typeof record.id === "string" && /^\d+$/.test(record.id)
            ? Number(record.id)
            : null;
      if (rawId !== null && (!Number.isSafeInteger(rawId) || rawId < 0)) {
        return null;
      }
      return { name: record.name, id: rawId };
    })
    .filter((entry): entry is LedgerEntry => entry !== null);
  if (entries.length !== rows.length) {
    throw new Error("migration probe returned an invalid ledger row");
  }
  return entries;
}

function assertLedgerOrder(entries: LedgerEntry[]): void {
  const names = entries.map((entry) => entry.name);
  if (new Set(names).size !== names.length) {
    throw new Error("migration ledger contains duplicate migration names");
  }
  assertOrder(names, "applied migration order", true);
  const ids = entries.map((entry) => entry.id);
  if (ids.some((id) => id === null)) {
    if (ids.some((id) => id !== null)) {
      throw new Error("migration ledger contains a mix of identified rows");
    }
    return;
  }
  let previous = Number.NEGATIVE_INFINITY;
  for (const id of ids) {
    if (id! <= previous) {
      throw new Error("migration ledger ids are not strictly ordered");
    }
    previous = id!;
  }
}

/** Validate the actual D1 ledger, not just a set of names. */
export function assertAppliedMigrations(
  rows: unknown,
  files: readonly string[] = []
): void {
  const entries = ledgerEntries(rows);
  const names = entries.map((entry) => entry.name);
  const positions = new Map(names.map((name, index) => [name, index]));
  const required = requiredMigrationsForFiles(files);
  let previous = Number.NEGATIVE_INFINITY;
  for (const migration of required) {
    const position = positions.get(migration);
    if (position === undefined) {
      throw new Error(`required migration is not applied: ${migration}`);
    }
    if (position <= previous) {
      throw new Error(
        `applied migration order is invalid: ${migration} is out of order`
      );
    }
    previous = position;
  }
  assertOrder(required, "required migration order");
  assertLedgerOrder(entries);
}

/** Validate ordering for a ledger before a new migration is applied. */
export function assertMigrationLedgerOrder(
  rows: unknown,
  files: readonly string[] = []
): void {
  const entries = ledgerEntries(rows);
  const names = entries.map((entry) => entry.name);
  const positions = new Map(names.map((name, index) => [name, index]));
  const required = requiredMigrationsForFiles(files);
  let sawMissingRequired = false;
  let previous = Number.NEGATIVE_INFINITY;
  for (const migration of required) {
    const position = positions.get(migration);
    if (position === undefined) {
      sawMissingRequired = true;
      continue;
    }
    if (sawMissingRequired || position <= previous) {
      throw new Error(
        `migration ledger order is invalid: ${migration} is out of order`
      );
    }
    previous = position;
  }
  assertLedgerOrder(entries);
}

export function parseWranglerMigrationOutput(output: string): unknown {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end <= start) {
    throw new Error("could not parse Wrangler migration JSON");
  }
  return JSON.parse(output.slice(start, end + 1));
}
