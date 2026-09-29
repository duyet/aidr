/**
 * Regenerate the source registry migration from
 * `worker/sources/catalog.ts`.
 *
 *   pnpm --filter @aidr/web run gen:source-migration
 *   pnpm --filter @aidr/web run gen:source-migration -- --check
 *
 * This exists so "add a source" is a one-line change to ONE registry rather
 * than a hand-written SQL block that can drift from the runtime seed. The
 * generated file is checked in (migrations must be in the repo for
 * `wrangler d1 migrations apply`), but `--check` plus
 * `worker/__tests__/source-catalog.test.ts` guarantee the checked-in bytes
 * are exactly what the registry produces, so the drift is impossible to
 * commit rather than merely unlikely.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSourceMigrationSql } from "../worker/sources/catalog.js";

/** Next migration number. Bump this when the generated body actually changes
 *  and a new migration file is wanted; a *correction* to an unreleased
 *  migration should be made by bumping the number too, never by editing the
 *  generated file in place (D1 records applied migrations by name).
 *
 *  The header prose lives in `SOURCE_MIGRATION_COMMENTS` in the catalog, not
 *  here, so the catalog stays the single owner of everything the generated file
 *  contains and the byte-equality test has one thing to compare against. */
const FILE_NAME = "0027_source_registry.sql";

const outPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
  FILE_NAME
);

const sql = buildSourceMigrationSql({ fileName: FILE_NAME });

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(outPath, "utf8");
  } catch {
    console.error(
      `missing ${FILE_NAME}; run pnpm --filter @aidr/web run gen:source-migration`
    );
    process.exit(1);
  }
  if (current !== sql) {
    console.error(
      `${FILE_NAME} is out of date with worker/sources/catalog.ts.\n` +
        "Run: pnpm --filter @aidr/web run gen:source-migration"
    );
    process.exit(1);
  }
  console.log(`${FILE_NAME} matches the registry.`);
} else {
  writeFileSync(outPath, sql);
  console.log(`wrote ${FILE_NAME}`);
}
