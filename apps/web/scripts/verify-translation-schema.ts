#!/usr/bin/env tsx
/**
 * Read-only deploy gate for the translation-review schema.
 *
 * It never applies a migration. `pnpm run deploy` runs this in remote mode
 * before building/deploying; local/preview callers may pass --local.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const migrationsDir = path.join(root, "migrations");
const requiredMigrations = [
  "0023_translation_reviews.sql",
  "0025_translation_review_hardening.sql",
];
if (existsSync(path.join(migrationsDir, "0024_item_media_manifest.sql"))) {
  requiredMigrations.splice(1, 0, "0024_item_media_manifest.sql");
}

export function assertRequiredMigrationsApplied(output: string): void {
  const pending = requiredMigrations.filter((name) => output.includes(name));
  if (pending.length > 0) {
    throw new Error(
      `translation review schema is pending: ${pending.join(", ")}; apply migrations in order before deploy`
    );
  }
}

export function assertRemoteSchemaOutput(output: string): void {
  const required = [
    "translation_review_attempts",
    "translation_review_state",
    "translation_review_resolutions",
    "qa_candidate_hash",
    "qa_source_revision",
    "source_lang",
    "target_lang",
    "attempt_number",
    "trg_items_source_revision",
  ];
  const missing = required.filter((token) => !output.includes(token));
  if (missing.length > 0) {
    throw new Error(
      `remote translation review schema is incomplete: ${missing.join(", ")}`
    );
  }
}

function wrangler(args: string[]): string {
  try {
    return execFileSync("pnpm", ["exec", "wrangler", ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("wrangler schema verification failed; deploy is blocked");
  }
}

function main(): void {
  const local = process.argv.includes("--local");
  const migrationOutput = wrangler([
    "d1",
    "migrations",
    "list",
    "aidr",
    "--config",
    "wrangler.toml",
    ...(local ? ["--local"] : ["--remote"]),
  ]);
  assertRequiredMigrationsApplied(migrationOutput);

  const schemaOutput = wrangler([
    "d1",
    "execute",
    "aidr",
    "--config",
    "wrangler.toml",
    ...(local ? ["--local"] : ["--remote"]),
    "--command",
    "SELECT 'translation_review_attempts' AS schema_token FROM sqlite_master WHERE name = 'translation_review_attempts' UNION ALL SELECT 'translation_review_state' FROM sqlite_master WHERE name = 'translation_review_state' UNION ALL SELECT 'translation_review_resolutions' FROM sqlite_master WHERE name = 'translation_review_resolutions' UNION ALL SELECT 'trg_items_source_revision' FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_items_source_revision' UNION ALL SELECT name FROM pragma_table_info('translations') WHERE name IN ('qa_candidate_hash','qa_source_revision','source_lang','target_lang') UNION ALL SELECT name FROM pragma_table_info('translation_review_attempts') WHERE name = 'attempt_number';",
  ]);
  assertRemoteSchemaOutput(schemaOutput);
  console.log(
    `translation review schema verified (${requiredMigrations.join(", ")}${local ? " [local]" : " [remote]"})`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "schema verification failed"
    );
    process.exit(1);
  }
}
