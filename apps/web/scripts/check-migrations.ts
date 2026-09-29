import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertAppliedMigrations,
  assertMigrationFileOrder,
  assertMigrationLedgerOrder,
} from "../worker/migration-gate.js";
import { cf, D1_DATABASE_ID, d1ResultRows } from "./cf-d1.js";

const scriptPath = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(scriptPath), "..");

function migrationRows(): unknown {
  return d1ResultRows(
    cf([
      "d1",
      "query",
      D1_DATABASE_ID,
      "--sql",
      "SELECT id, name FROM d1_migrations ORDER BY id",
    ])
  );
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const localOrderOnly = args.includes("--local-order");
  const ledgerOrderOnly = args.includes("--ledger-order");
  if (localOrderOnly && ledgerOrderOnly) {
    throw new Error("choose only one migration check mode");
  }
  const migrations = readdirSync(path.join(webRoot, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  assertMigrationFileOrder(migrations);

  if (localOrderOnly) {
    console.log("media manifest migration file order check passed");
    return;
  }

  const rows = migrationRows();
  assertMigrationLedgerOrder(rows, migrations);
  if (ledgerOrderOnly) {
    console.log("media manifest migration ledger order check passed");
    return;
  }
  assertAppliedMigrations(rows, migrations);

  const columns = d1ResultRows(
    cf(["d1", "query", D1_DATABASE_ID, "--sql", "PRAGMA table_info(items)"])
  );
  const columnRows = Array.isArray(columns)
    ? (columns as Array<{ name?: unknown }>)
    : [];
  if (!columnRows.some((column) => column.name === "media_manifest")) {
    throw new Error(
      "items.media_manifest is missing from the target D1 schema"
    );
  }

  console.log(
    migrations.includes("0025_translation_review_hardening.sql")
      ? "media manifest migration gate passed (0023 -> 0024 -> 0025)"
      : "media manifest migration gate passed (0023 -> 0024)"
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    console.error(
      `migration gate failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
