#!/usr/bin/env node
// Copy the agent's six secrets from the repo .env.local into the aidr-daily-video vault, each scoped to
// its one host (README "Credentials"). Values go to `ant` over stdin: never printed, never in argv.
// A credential whose display_name is already in the vault is skipped; pass --replace to archive and re-add it.
// Usage: node agents/aidr-daily-video/vault-sync.mjs [--replace] [--dry-run]
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "../..");
const replace = process.argv.includes("--replace");
const dry = process.argv.includes("--dry-run");

// secret_name → [allowed host, injection location]
const CREDENTIALS = {
  ELEVENLABS_API_KEY: ["api.elevenlabs.io", "header"],
  NEWS_ADMIN_TOKEN: ["aidr.today", "header"],
  TELEGRAM_STAGING_CHAT_ID: ["aidr.today", "body"],
  YOUTUBE_CLIENT_ID: ["oauth2.googleapis.com", "body"],
  YOUTUBE_CLIENT_SECRET: ["oauth2.googleapis.com", "body"],
  YOUTUBE_REFRESH_TOKEN: ["oauth2.googleapis.com", "body"],
};

const lock = JSON.parse(readFileSync(join(REPO, "claude-lock.json"), "utf8"));
const vaultId = lock.resources?.["./agents/aidr-daily-video/vault.yaml"]?.id;
if (!vaultId) throw new Error("no vault id in claude-lock.json: run `ant apply --yes agents/aidr-daily-video/vault.yaml` first");

const envFile = join(REPO, ".env.local");
if (!existsSync(envFile)) throw new Error(".env.local is missing");
const envText = readFileSync(envFile, "utf8");
const value = (name) =>
  envText.match(new RegExp(`^(?:export\\s+)?${name}=(?:"([^"]*)"|'([^']*)'|([^\\s#]*))`, "m"))?.slice(1).find((v) => v !== undefined) || null;

// One JSON value per output line (jsonl): a list prints one row per credential.
function ant(args, input) {
  const r = spawnSync("ant", [...args, "--format", "jsonl"], { input, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ant ${args[0]} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

const existing = ant(["beta:vaults:credentials", "list", "--vault-id", vaultId, "--max-items", "-1"]);

const missing = Object.keys(CREDENTIALS).filter((n) => !value(n));
if (missing.length) throw new Error(`.env.local has no value for: ${missing.join(", ")}`);

console.log(`vault ${vaultId}${dry ? " (dry run)" : ""}`);
for (const [name, [host, loc]] of Object.entries(CREDENTIALS)) {
  const found = existing.find((c) => c.display_name === name);
  if (found && !replace) {
    console.log(`  = ${name} (already in vault, ${found.id})`);
    continue;
  }
  if (found && !dry) ant(["beta:vaults:credentials", "archive", "--vault-id", vaultId, "--credential-id", found.id]);
  console.log(`  + ${name} → ${host} (${loc})${found ? " [replaced]" : ""}`);
  if (dry) continue;
  const body = {
    display_name: name,
    auth: {
      type: "environment_variable",
      secret_name: name,
      secret_value: value(name),
      networking: { type: "limited", allowed_hosts: [host] },
      injection_location: { header: loc === "header", body: loc === "body" },
    },
  };
  const [created] = ant(["beta:vaults:credentials", "create", "--vault-id", vaultId], JSON.stringify(body));
  console.log(`    ${created?.id ?? "created"}`);
}
