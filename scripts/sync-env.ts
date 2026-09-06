#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Sync local env → GitHub Actions secrets + Cloudflare Worker secrets.
 *
 * Usage (repo root):
 *   pnpm sync-env
 *   pnpm sync-env --dry-run
 *   pnpm sync-env --github
 *   pnpm sync-env --workers
 *   pnpm sync-env --github-env production
 *
 * Reads (later files win): root `.env` → `.env.local` → `.env.production` →
 * `.env.production.local`, then `apps/web` `.env` / `.env.local` /
 * `.env.production` / `.dev.vars`.
 *
 * Never prints secret values — only key names and masked suffixes.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const appDir = join(rootDir, "apps/web");

const WORKER_NAME = "aidr";
const GH_REPO = "duyet/aidr";

/** Secrets the Worker runtime needs (wrangler secret). */
const WORKER_REQUIRED = [
  "ANYROUTER_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "NEWS_ADMIN_TOKEN",
  "CLERK_SECRET_KEY",
] as const;

const WORKER_OPTIONAL = [
  "CLERK_PUBLISHABLE_KEY",
  "NEWS_UNSUBSCRIBE_SECRET",
  "NOTIFY_WEBHOOK_URL",
  "NEWS_ADMIN_USER_IDS",
] as const;

/** Secrets GitHub Actions workflows read (`secrets.*`). */
const GITHUB_REQUIRED = [
  "CLOUDFLARE_API_TOKEN",
  "VITE_CLERK_PUBLISHABLE_KEY",
  "NEWS_ADMIN_TOKEN",
] as const;

const GITHUB_OPTIONAL = [
  "ANYROUTER_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "CLERK_SECRET_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_ZONE_ID",
  "CLERK_PUBLISHABLE_KEY",
] as const;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const workersOnly = args.has("--workers") && !args.has("--github");
const githubOnly = args.has("--github") && !args.has("--workers");
const doWorkers = !githubOnly;
const doGithub = !workersOnly;
const failMissing = args.has("--fail-missing");

function githubEnvFlag(): string | undefined {
  const idx = process.argv.indexOf("--github-env");
  if (idx === -1) return "production"; // deploy job uses environment: production
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("-")) return "production";
  if (next === "none" || next === "repo") return undefined;
  return next;
}

function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) result[key] = value;
  }
  return result;
}

function loadEnvFiles(): { env: Record<string, string>; sources: string[] } {
  const env: Record<string, string> = {};
  const sources: string[] = [];
  const files = [
    join(rootDir, ".env"),
    join(rootDir, ".env.local"),
    join(appDir, ".env"),
    join(appDir, ".env.local"),
    join(appDir, ".dev.vars"),
    // Production last so `pnpm sync-env` prefers live keys for Worker/GH.
    join(rootDir, ".env.production"),
    join(rootDir, ".env.production.local"),
    join(appDir, ".env.production"),
  ];
  for (const filePath of files) {
    if (!existsSync(filePath)) continue;
    Object.assign(env, parseEnvContent(readFileSync(filePath, "utf-8")));
    sources.push(filePath.replace(`${rootDir}/`, ""));
  }
  // Clerk's TanStack SDK reads CLERK_PUBLISHABLE_KEY; Vite exposes
  // VITE_CLERK_PUBLISHABLE_KEY to the client. Treat them as aliases.
  if (!env.CLERK_PUBLISHABLE_KEY && env.VITE_CLERK_PUBLISHABLE_KEY) {
    env.CLERK_PUBLISHABLE_KEY = env.VITE_CLERK_PUBLISHABLE_KEY;
  }
  if (!env.VITE_CLERK_PUBLISHABLE_KEY && env.CLERK_PUBLISHABLE_KEY) {
    env.VITE_CLERK_PUBLISHABLE_KEY = env.CLERK_PUBLISHABLE_KEY;
  }
  return { env, sources };
}

function pick(
  env: Record<string, string>,
  required: readonly string[],
  optional: readonly string[]
): { present: Record<string, string>; missing: string[] } {
  const present: Record<string, string> = {};
  const missing: string[] = [];
  for (const key of required) {
    if (env[key]) present[key] = env[key];
    else missing.push(key);
  }
  for (const key of optional) {
    if (env[key]) present[key] = env[key];
  }
  return { present, missing };
}

function mask(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function run(
  cmd: string,
  cmdArgs: string[],
  opts: { cwd?: string; input?: string } = {}
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: opts.cwd ?? rootDir,
    input: opts.input,
    encoding: "utf-8",
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function syncWorker(secrets: Record<string, string>): boolean {
  const keys = Object.keys(secrets);
  console.log(`\n[workers] ${WORKER_NAME} — ${keys.length} secret(s)`);
  for (const key of keys) console.log(`  · ${key}  ${mask(secrets[key])}`);

  if (dryRun) {
    console.log("  [dry-run] skip wrangler secret bulk");
    return true;
  }
  if (keys.length === 0) {
    console.log("  [skip] nothing to sync");
    return true;
  }

  const tmpFile = join(os.tmpdir(), `aidr-worker-secrets-${Date.now()}.json`);
  try {
    writeFileSync(tmpFile, JSON.stringify(secrets, null, 2));
    const result = run(
      "pnpm",
      ["exec", "wrangler", "secret", "bulk", tmpFile, "--name", WORKER_NAME],
      { cwd: appDir }
    );
    if (!result.ok) {
      console.error(`  [error] wrangler secret bulk failed`);
      if (result.stderr) console.error(result.stderr.trim());
      return false;
    }
    console.log(`  [ok] Worker ${WORKER_NAME}`);
    return true;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

function ensureGh(): boolean {
  const who = run("gh", ["auth", "status"]);
  if (!who.ok) {
    console.error(
      "  [error] gh not authenticated — run `gh auth login` (needs `repo` scope)"
    );
    return false;
  }
  return true;
}

function syncGithub(
  secrets: Record<string, string>,
  environment: string | undefined
): boolean {
  const keys = Object.keys(secrets);
  const dest = environment
    ? `${GH_REPO} env:${environment}`
    : `${GH_REPO} (repo)`;
  console.log(`\n[github] ${dest} — ${keys.length} secret(s)`);
  for (const key of keys) console.log(`  · ${key}  ${mask(secrets[key])}`);

  if (dryRun) {
    console.log("  [dry-run] skip gh secret set");
    return true;
  }
  if (keys.length === 0) {
    console.log("  [skip] nothing to sync");
    return true;
  }
  if (!ensureGh()) return false;

  let ok = true;
  for (const key of keys) {
    const args = ["secret", "set", key, "--repo", GH_REPO];
    if (environment) args.push("--env", environment);
    const result = run("gh", args, { input: secrets[key] });
    if (!result.ok) {
      ok = false;
      console.error(`  [error] failed ${key}`);
      if (result.stderr) console.error(`    ${result.stderr.trim()}`);
    }
  }

  // Always mirror to repo-level too when targeting an environment, so
  // non-environment jobs (ingest) still resolve secrets.*
  if (ok && environment) {
    console.log(
      `\n[github] ${GH_REPO} (repo mirror) — ${keys.length} secret(s)`
    );
    for (const key of keys) {
      const result = run("gh", ["secret", "set", key, "--repo", GH_REPO], {
        input: secrets[key],
      });
      if (!result.ok) {
        ok = false;
        console.error(`  [error] failed repo ${key}`);
        if (result.stderr) console.error(`    ${result.stderr.trim()}`);
      }
    }
  }

  if (ok) console.log(`  [ok] GitHub secrets`);
  return ok;
}

function printHelp(): void {
  console.log(`Sync local env → GitHub Actions + Cloudflare Worker

Usage:
  pnpm sync-env                 # both targets (default)
  pnpm sync-env --dry-run       # show what would sync
  pnpm sync-env --workers       # Worker secrets only
  pnpm sync-env --github        # GitHub secrets only
  pnpm sync-env --github-env production   # default; use "none" for repo-only
  pnpm sync-env --fail-missing  # exit 1 if required keys absent

Env files (later wins):
  .env  .env.local  .env.production  .env.production.local
  apps/web/.env  .env.local  .env.production  .dev.vars
`);
}

function main(): void {
  if (args.has("--help") || args.has("-h")) {
    printHelp();
    return;
  }

  console.log("aidr sync-env");
  if (dryRun) console.log("(dry-run — no remote writes)\n");

  const { env, sources } = loadEnvFiles();
  if (sources.length === 0) {
    console.error(
      "[error] no .env files found — copy .env.example → .env.local"
    );
    process.exit(1);
  }
  console.log(`[info] loaded ${sources.length} file(s): ${sources.join(", ")}`);

  let failed = false;
  let missingRequired = false;

  if (doWorkers) {
    const { present, missing } = pick(env, WORKER_REQUIRED, WORKER_OPTIONAL);
    if (missing.length) {
      missingRequired = true;
      console.warn(`\n[workers] missing required: ${missing.join(", ")}`);
    }
    if (!syncWorker(present)) failed = true;
  }

  if (doGithub) {
    const { present, missing } = pick(env, GITHUB_REQUIRED, GITHUB_OPTIONAL);
    if (missing.length) {
      missingRequired = true;
      console.warn(`\n[github] missing required: ${missing.join(", ")}`);
    }
    const ghEnv = githubEnvFlag();
    if (!syncGithub(present, ghEnv)) failed = true;
  }

  console.log("");
  if (failed) {
    console.error("[done] finished with errors");
    process.exit(1);
  }
  if (failMissing && missingRequired) {
    console.error("[done] required secrets missing");
    process.exit(1);
  }
  console.log("[done] sync complete");
}

if (resolve(process.argv[1] ?? "") === resolve(__filename)) {
  main();
}
