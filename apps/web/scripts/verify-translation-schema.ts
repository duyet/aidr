#!/usr/bin/env tsx
/**
 * Read-only migration/schema gate for translation QA.
 *
 * This command never applies a migration and never changes a deploy setting.
 * `pnpm run deploy` invokes it before the build, so a Worker cannot be built
 * against a database that has not reached the translation contract.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "migrations");

export const TRANSLATION_REVIEW_MIGRATION = "0023_translation_reviews.sql";
export const MEDIA_MANIFEST_MIGRATION = "0024_item_media_manifest.sql";
export const RUN_IDENTITY_MIGRATION = "0025_llm_call_run_identity.sql";
/** This name belonged to an earlier draft and must never be resurrected. */
const OBSOLETE_TRANSLATION_HARDENING_MIGRATION =
  "0025_translation_review_hardening.sql";

export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function migrationNumber(name: string): number {
  const match = /^(\d+)_/.exec(name);
  if (!match) throw new Error(`invalid migration filename: ${name}`);
  return Number.parseInt(match[1], 10);
}

/**
 * Return the migrations this checkout must have applied.  0024 and 0025 are
 * optional here so #158 can be reviewed independently; when their files are
 * present, they become part of the same ordered gate.  This is what lets a
 * later #160/#161 integration reserve 0025 without renumbering this branch.
 */
export function requiredMigrationsForFiles(
  files: readonly string[] = migrationFiles()
): string[] {
  const available = new Set(files);
  if (available.has(OBSOLETE_TRANSLATION_HARDENING_MIGRATION)) {
    throw new Error(
      `${OBSOLETE_TRANSLATION_HARDENING_MIGRATION} conflicts with ${RUN_IDENTITY_MIGRATION}; fold translation QA into 0023`
    );
  }
  const required = [TRANSLATION_REVIEW_MIGRATION];
  if (available.has(MEDIA_MANIFEST_MIGRATION)) {
    required.push(MEDIA_MANIFEST_MIGRATION);
  }
  if (available.has(RUN_IDENTITY_MIGRATION)) {
    if (!available.has(MEDIA_MANIFEST_MIGRATION)) {
      throw new Error(
        `${RUN_IDENTITY_MIGRATION} requires ${MEDIA_MANIFEST_MIGRATION} after ${TRANSLATION_REVIEW_MIGRATION}`
      );
    }
    required.push(RUN_IDENTITY_MIGRATION);
  }
  return required;
}

/** Reject an out-of-order or incomplete migration set before Wrangler runs. */
export function assertMigrationFileOrder(
  files: readonly string[] = migrationFiles()
): void {
  const available = new Set(files);
  const required = requiredMigrationsForFiles(files);
  for (const migration of required) {
    if (!available.has(migration)) {
      throw new Error(`missing required migration ${migration}`);
    }
  }
  let previous = Number.NEGATIVE_INFINITY;
  for (const name of files) {
    const number = migrationNumber(name);
    // The repository intentionally has two 0015 files; equal numeric
    // prefixes are valid, but a decreasing prefix is not.
    if (number < previous) {
      throw new Error(`migration files are not in numeric order: ${name}`);
    }
    previous = number;
  }
  let cursor = -1;
  for (const name of required) {
    const index = files.indexOf(name);
    if (index <= cursor) {
      throw new Error(`required migrations are not in order: ${name}`);
    }
    cursor = index;
  }
}

/**
 * `wrangler d1 migrations list` prints only unapplied migration filenames.
 * Treat every recognized required filename in that output as pending; a
 * successful gate therefore requires an output such as "No migrations to
 * apply." This deliberately does not infer application state from a ledger
 * row that may belong to a different database.
 */
export function assertRequiredMigrationsApplied(
  output: string,
  files: readonly string[] = migrationFiles()
): void {
  const required = requiredMigrationsForFiles(files);
  const pending = required.filter((name) => output.includes(name));
  if (pending.length > 0) {
    throw new Error(
      `translation review schema is pending: ${pending.join(", ")}; apply migrations in order before deploy`
    );
  }
}

function schemaOutputContains(output: string, token: string): boolean {
  if (output.includes(token)) return true;
  try {
    const parsed = JSON.parse(output) as unknown;
    const values: string[] = [];
    const visit = (value: unknown): void => {
      if (typeof value === "string") values.push(value);
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") {
        Object.values(value as Record<string, unknown>).forEach(visit);
      }
    };
    visit(parsed);
    return values.some((value) => value.includes(token));
  } catch {
    return false;
  }
}

export function assertRemoteSchemaOutput(
  output: string,
  files: readonly string[] = migrationFiles()
): void {
  const required = [
    "translation_reviews",
    "translation_review_attempts",
    "translation_review_state",
    "translation_review_resolutions",
    "qa_candidate_hash",
    "qa_source_hash",
    "qa_source_revision",
    "source_lang",
    "target_lang",
    "source_revision",
    "attempt_number",
    "criteria_fingerprint",
    "prompt_fingerprint",
    "policy_fingerprint",
    "model_fingerprint",
    "candidate_title",
    "candidate_summary",
    "manual_retry_count",
    "trg_items_source_revision",
    "trg_translations_candidate_invalidation",
    "trg_translations_marker_invalidation",
  ];
  if (files.includes(MEDIA_MANIFEST_MIGRATION)) {
    required.push("media_manifest");
  }
  if (files.includes(RUN_IDENTITY_MIGRATION)) {
    required.push(
      "run_id",
      "error_code",
      "error_status",
      "idx_llm_calls_run_id_ts"
    );
  }
  const missing = required.filter(
    (token) => !schemaOutputContains(output, token)
  );
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
  const files = migrationFiles();
  assertMigrationFileOrder(files);
  const required = requiredMigrationsForFiles(files);

  const migrationOutput = wrangler([
    "d1",
    "migrations",
    "list",
    "aidr",
    "--config",
    "wrangler.toml",
    ...(local ? ["--local"] : ["--remote"]),
  ]);
  assertRequiredMigrationsApplied(migrationOutput, files);

  // D1's SQLite build has a very low compound-SELECT term limit (five in
  // the local runtime). Keep each read-only probe below that limit instead of
  // sending one giant UNION query.
  const schemaQueries = [
    `SELECT 'translation_reviews' AS schema_token FROM sqlite_master WHERE name = 'translation_reviews'
     UNION ALL SELECT 'translation_review_attempts' FROM sqlite_master WHERE name = 'translation_review_attempts'
     UNION ALL SELECT 'translation_review_state' FROM sqlite_master WHERE name = 'translation_review_state'
     UNION ALL SELECT 'translation_review_resolutions' FROM sqlite_master WHERE name = 'translation_review_resolutions'`,
    `SELECT 'trg_items_source_revision' AS schema_token FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_items_source_revision'
     UNION ALL SELECT 'trg_translations_candidate_invalidation' FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_translations_candidate_invalidation'
     UNION ALL SELECT 'trg_translations_marker_invalidation' FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_translations_marker_invalidation'`,
    `SELECT 'source_lang' AS schema_token FROM pragma_table_info('items') WHERE name = 'source_lang'
     UNION ALL SELECT 'source_revision' FROM pragma_table_info('items') WHERE name = 'source_revision'`,
    `SELECT 'qa_source_hash' AS schema_token FROM pragma_table_info('translations') WHERE name = 'qa_source_hash'
     UNION ALL SELECT 'qa_candidate_hash' FROM pragma_table_info('translations') WHERE name = 'qa_candidate_hash'
     UNION ALL SELECT 'qa_source_revision' FROM pragma_table_info('translations') WHERE name = 'qa_source_revision'
     UNION ALL SELECT 'source_lang' FROM pragma_table_info('translations') WHERE name = 'source_lang'
     UNION ALL SELECT 'target_lang' FROM pragma_table_info('translations') WHERE name = 'target_lang'`,
    `SELECT 'attempt_number' AS schema_token FROM pragma_table_info('translation_review_attempts') WHERE name = 'attempt_number'
     UNION ALL SELECT 'criteria_fingerprint' FROM pragma_table_info('translation_review_attempts') WHERE name = 'criteria_fingerprint'
     UNION ALL SELECT 'prompt_fingerprint' FROM pragma_table_info('translation_review_attempts') WHERE name = 'prompt_fingerprint'
     UNION ALL SELECT 'policy_fingerprint' FROM pragma_table_info('translation_review_attempts') WHERE name = 'policy_fingerprint'
     UNION ALL SELECT 'model_fingerprint' FROM pragma_table_info('translation_review_attempts') WHERE name = 'model_fingerprint'`,
    `SELECT 'candidate_title' AS schema_token FROM pragma_table_info('translation_review_state') WHERE name = 'candidate_title'
     UNION ALL SELECT 'candidate_summary' FROM pragma_table_info('translation_review_state') WHERE name = 'candidate_summary'
     UNION ALL SELECT 'manual_retry_count' FROM pragma_table_info('translation_review_state') WHERE name = 'manual_retry_count'`,
  ];
  if (files.includes(MEDIA_MANIFEST_MIGRATION)) {
    schemaQueries.push(
      `SELECT 'media_manifest' AS schema_token FROM pragma_table_info('items') WHERE name = 'media_manifest'`
    );
  }
  if (files.includes(RUN_IDENTITY_MIGRATION)) {
    schemaQueries.push(
      `SELECT 'run_id' AS schema_token FROM pragma_table_info('llm_calls') WHERE name = 'run_id'
       UNION ALL SELECT 'error_code' FROM pragma_table_info('llm_calls') WHERE name = 'error_code'
       UNION ALL SELECT 'error_status' FROM pragma_table_info('llm_calls') WHERE name = 'error_status'
       UNION ALL SELECT 'idx_llm_calls_run_id_ts' FROM sqlite_master WHERE type = 'index' AND name = 'idx_llm_calls_run_id_ts'`
    );
  }
  const schemaOutput = schemaQueries
    .map((command) =>
      wrangler([
        "d1",
        "execute",
        "aidr",
        "--config",
        "wrangler.toml",
        ...(local ? ["--local"] : ["--remote"]),
        "--command",
        `${command};`,
        "--json",
      ])
    )
    .join("\n");
  assertRemoteSchemaOutput(schemaOutput, files);
  console.log(
    `translation review schema verified (${required.join(", ")}${local ? " [local]" : " [remote]"})`
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

// Keep the existence check close to the gate so a stale local checkout cannot
// silently omit the migration directory.  The test suite imports the pure
// assertions above and does not invoke Wrangler.
if (!existsSync(migrationsDir)) {
  throw new Error(
    `translation migration directory is missing: ${migrationsDir}`
  );
}
