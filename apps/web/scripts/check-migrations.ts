import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertAppliedMigrations,
  assertMigrationFileOrder,
  assertMigrationLedgerOrder,
  parseWranglerMigrationOutput,
} from "../worker/migration-gate.js";

const scriptPath = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(scriptPath), "..");

function wrangler(args: string[]): string {
  return execFileSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: webRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function migrationRows(): unknown {
  const output = wrangler([
    "d1",
    "execute",
    "aidr",
    "--config",
    "wrangler.toml",
    "--remote",
    "--command",
    "SELECT id, name FROM d1_migrations ORDER BY id",
    "--json",
  ]);
  const parsed = parseWranglerMigrationOutput(output);
  const firstResult = Array.isArray(parsed) ? parsed[0] : null;
  return firstResult && typeof firstResult === "object"
    ? (firstResult as { results?: unknown }).results
    : null;
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

  const schemaOutput = wrangler([
    "d1",
    "execute",
    "aidr",
    "--config",
    "wrangler.toml",
    "--remote",
    "--command",
    "PRAGMA table_info(items)",
    "--json",
  ]);
  const schemaRows = parseWranglerMigrationOutput(schemaOutput);
  const firstSchemaResult = Array.isArray(schemaRows) ? schemaRows[0] : null;
  const columns =
    firstSchemaResult &&
    typeof firstSchemaResult === "object" &&
    Array.isArray((firstSchemaResult as { results?: unknown }).results)
      ? ((firstSchemaResult as { results: unknown[] }).results as Array<{
          name?: unknown;
        }>)
      : [];
  if (!columns.some((column) => column.name === "media_manifest")) {
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
