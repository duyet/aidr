#!/usr/bin/env tsx
/**
 * @deprecated Use repo-root `pnpm sync-env` (scripts/sync-env.ts).
 * Kept so `pnpm --filter @aidr/web config` still works.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const rootScript = join(rootDir, "scripts/sync-env.ts");
const passed = process.argv.slice(2);
const hasTarget = passed.some((a) =>
  ["--workers", "--github", "--help", "-h"].includes(a)
);

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "tsx",
    rootScript,
    ...(hasTarget ? passed : ["--workers", ...passed]),
  ],
  { stdio: "inherit", cwd: rootDir, env: process.env }
);

process.exit(result.status ?? 1);
