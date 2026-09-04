#!/usr/bin/env tsx
/**
 * Sync Worker secrets for the aidr Worker via wrangler secret bulk.
 *
 * Usage (from apps/web or repo root):
 *   tsx scripts/sync-secrets.ts [--dry-run]
 *
 * Reads root + apps/web .env files, then bulk-puts secrets for Worker `aidr`.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = join(__dirname, "..");
const rootDir = join(appDir, "../..");

const WORKER_NAME = "aidr";

/** Required Worker secrets (duyet-news / aidr pipeline). */
const SECRETS = [
  "ANYROUTER_API_KEY",
  "CLICKHOUSE_HOST",
  "CLICKHOUSE_NEWS_USER",
  "CLICKHOUSE_NEWS_PASSWORD",
  "CLICKHOUSE_DATABASE",
  "TELEGRAM_BOT_TOKEN",
  "NEWS_ADMIN_TOKEN",
] as const;

/** Optional — synced only when present in env files. */
const OPTIONAL_SECRETS = [
  "ANYROUTER_BASE_URL",
  "TELEGRAM_CHAT_ID",
  "NEWS_ADMIN_USER_IDS",
  "NEWS_UNSUBSCRIBE_SECRET",
  "NOTIFY_WEBHOOK_URL",
] as const;

const dryRun = process.argv.includes("--dry-run");

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
    result[key] = value;
  }
  return result;
}

function loadEnvFiles(): Record<string, string> {
  const env: Record<string, string> = {};
  const rootFiles = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ];
  for (const file of rootFiles) {
    const filePath = join(rootDir, file);
    if (!existsSync(filePath)) continue;
    Object.assign(env, parseEnvContent(readFileSync(filePath, "utf-8")));
  }
  for (const file of [".env", ".env.local", ".env.production", ".dev.vars"]) {
    const filePath = join(appDir, file);
    if (!existsSync(filePath)) continue;
    Object.assign(env, parseEnvContent(readFileSync(filePath, "utf-8")));
  }
  return env;
}

function collectSecrets(env: Record<string, string>): {
  secrets: Record<string, string>;
  missing: string[];
} {
  const secrets: Record<string, string> = {};
  const missing: string[] = [];
  for (const key of SECRETS) {
    const value = env[key];
    if (value) secrets[key] = value;
    else missing.push(key);
  }
  for (const key of OPTIONAL_SECRETS) {
    const value = env[key];
    if (value) secrets[key] = value;
  }
  return { secrets, missing };
}

function mask(value: string): string {
  return value.length > 8
    ? `${value.slice(0, 4)}...${value.slice(-4)}`
    : "****";
}

function syncBulk(secrets: Record<string, string>): boolean {
  if (dryRun) {
    console.log(
      `  [DRY RUN] Would sync ${Object.keys(secrets).length} secrets to Worker ${WORKER_NAME}`
    );
    return true;
  }
  if (Object.keys(secrets).length === 0) return true;

  const tmpFile = join(
    os.tmpdir(),
    `wrangler-seeds-${WORKER_NAME}-${Date.now()}.json`
  );
  try {
    writeFileSync(tmpFile, JSON.stringify(secrets, null, 2));
    const result = spawnSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "secret",
        "bulk",
        tmpFile,
        "--name",
        WORKER_NAME,
      ],
      {
        cwd: appDir,
        stdio: ["inherit", "pipe", "pipe"],
        env: process.env,
        encoding: "utf-8",
      }
    );
    if (result.status !== 0) {
      console.error(`  [ERROR] Failed to sync secrets: ${result.stderr ?? ""}`);
      return false;
    }
    return true;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }
}

function main() {
  console.log(`\n[${WORKER_NAME}] Syncing Worker secrets...`);
  if (dryRun) console.log("[INFO] Dry run — no changes\n");

  const env = loadEnvFiles();
  if (Object.keys(env).length === 0) {
    console.error("  [ERROR] No env vars found in root or apps/web .env files");
    process.exit(1);
  }

  const { secrets, missing } = collectSecrets(env);
  if (missing.length > 0) {
    console.warn(
      `  [WARN] Missing ${missing.length} required secret(s): ${missing.join(", ")}`
    );
  }

  const keys = Object.keys(secrets);
  if (keys.length === 0) {
    console.log("  [INFO] No secrets to sync");
    process.exit(missing.length > 0 ? 1 : 0);
  }

  console.log(`  [INFO] Syncing ${keys.length} secrets:`);
  for (const key of keys) {
    console.log(`    - ${key}: ${mask(secrets[key])}`);
  }

  if (!syncBulk(secrets)) process.exit(1);
  console.log(`  [OK] Synced ${keys.length} secrets to Worker ${WORKER_NAME}`);
}

if (resolve(process.argv[1] ?? "") === resolve(__filename)) {
  main();
}
