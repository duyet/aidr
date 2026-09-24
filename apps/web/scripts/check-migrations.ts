import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertAppliedMigrations,
  assertMigrationFileOrder,
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

export function main(): void {
  const migrations = readdirSync(path.join(webRoot, "migrations")).filter(
    (name) => name.endsWith(".sql")
  );
  assertMigrationFileOrder(migrations);

  const migrationOutput = wrangler([
    "d1",
    "execute",
    "aidr",
    "--config",
    "wrangler.toml",
    "--remote",
    "--command",
    "SELECT name FROM d1_migrations ORDER BY id",
    "--json",
  ]);
  const migrationRows = parseWranglerMigrationOutput(migrationOutput);
  const firstResult = Array.isArray(migrationRows) ? migrationRows[0] : null;
  assertAppliedMigrations(
    firstResult && typeof firstResult === "object"
      ? (firstResult as { results?: unknown }).results
      : null
  );

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

  console.log("media manifest migration gate passed (0023 -> 0024)");
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
