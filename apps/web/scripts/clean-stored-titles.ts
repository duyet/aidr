/**
 * One-off cleanup for rows ingested before titles were normalized at fetch
 * time (`worker/sources/registry.ts`): decodes leftover HTML entities in
 * items/translations title and summary, and strips a leading wire marker
 * ("UPDATE:", "Cập nhật:") from titles. Ids, URLs and dedupe keys are not
 * touched. Idempotent: a second run finds nothing to change.
 *
 *   tsx scripts/clean-stored-titles.ts           # dry run: counts + samples
 *   tsx scripts/clean-stored-titles.ts --apply   # write via wrangler --remote
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeHtmlEntitiesOnce,
  stripTitleMarker,
} from "../src/lib/plain-text.js";

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const apply = process.argv.includes("--apply");

const ENTITY_LIKE = ["%&#%", "%&amp;%", "%&quot;%", "%&lt;%", "%&gt;%"];

interface Target {
  table: "items" | "translations";
  key: string[];
  column: "title" | "summary";
  clean: (value: string) => string;
  /** Extra prefixes that make a row a candidate (title markers). */
  prefixes: string[];
}

const cleanTitle = (value: string) =>
  stripTitleMarker(decodeHtmlEntitiesOnce(value)).trim() || value;
const MARKER_PREFIXES = [
  "UPDATE%:%",
  "BREAKING%:%",
  "CẬP NHẬT:%",
  "Cập nhật:%",
  "TIN NÓNG:%",
];

const TARGETS: Target[] = [
  {
    table: "items",
    key: ["id"],
    column: "title",
    clean: cleanTitle,
    prefixes: MARKER_PREFIXES,
  },
  {
    table: "items",
    key: ["id"],
    column: "summary",
    clean: decodeHtmlEntitiesOnce,
    prefixes: [],
  },
  {
    table: "translations",
    key: ["item_id", "lang"],
    column: "title",
    clean: cleanTitle,
    prefixes: MARKER_PREFIXES,
  },
  {
    table: "translations",
    key: ["item_id", "lang"],
    column: "summary",
    clean: decodeHtmlEntitiesOnce,
    prefixes: [],
  },
];

function wrangler(args: string[]): string {
  return execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "aidr", "--remote", ...args],
    { cwd: webRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  );
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function select(target: Target): Array<Record<string, string>> {
  const likes = [
    ...ENTITY_LIKE.map((p) => `${target.column} LIKE ${sqlString(p)}`),
    ...target.prefixes.map((p) => `${target.column} LIKE ${sqlString(p)}`),
  ].join(" OR ");
  const sql = `SELECT ${target.key.join(", ")}, ${target.column} AS value FROM ${target.table} WHERE ${likes}`;
  const out = wrangler(["--json", "--command", sql]);
  const parsed = JSON.parse(out.slice(out.indexOf("["))) as Array<{
    results: Array<Record<string, string>>;
  }>;
  return parsed[0]?.results ?? [];
}

const statements: string[] = [];
for (const target of TARGETS) {
  const rows = select(target);
  let changed = 0;
  for (const row of rows) {
    const next = target.clean(row.value);
    if (next === row.value) continue;
    changed++;
    if (changed <= 3) {
      console.log(`  - ${row.value.slice(0, 100)}\n  + ${next.slice(0, 100)}`);
    }
    const where = target.key
      .map((k) => `${k} = ${sqlString(String(row[k]))}`)
      .join(" AND ");
    // The value guard keeps a concurrent ingest write from being overwritten.
    statements.push(
      `UPDATE ${target.table} SET ${target.column} = ${sqlString(next)} WHERE ${where} AND ${target.column} = ${sqlString(row.value)};`
    );
  }
  console.log(
    `${target.table}.${target.column}: ${changed} to change (${rows.length} candidates)`
  );
}

if (!apply) {
  console.log(`dry run: ${statements.length} updates; pass --apply to write`);
} else if (statements.length > 0) {
  const file = path.join(
    mkdtempSync(path.join(tmpdir(), "aidr-clean-")),
    "clean.sql"
  );
  writeFileSync(file, `${statements.join("\n")}\n`);
  wrangler(["--file", file, "--yes"]);
  console.log(`applied ${statements.length} updates`);
}
