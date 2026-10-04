#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collisionSkip,
  type FacebookPageAccount,
  mask,
  redactSecrets,
  selectPage,
  upsertEnv,
} from "./facebook-page-token.js";

/**
 * pnpm facebook:mint --user-token <short-lived user token>
 * pnpm facebook:mint --sync
 *
 * Reads FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_PAGE_ID from
 * `.env.local`. Writes FACEBOOK_PAGE_ACCESS_TOKEN back there. `--sync`
 * uploads only the Facebook keys to GitHub Actions and the Worker.
 * Nothing is printed in full.
 */

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(rootDir, ".env.local");
const wranglerFile = join(rootDir, "apps/web/wrangler.toml");

const args = process.argv.slice(2);
const sync = args.includes("--sync");

function argValue(name: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  const next = index === -1 ? undefined : args[index + 1];
  if (!next || next.startsWith("-")) return undefined;
  return next;
}

function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && value) result[key] = value;
  }
  return result;
}

function loadEnv(): Record<string, string> {
  const files = [
    join(rootDir, ".env"),
    envFile,
    join(rootDir, "apps/web/.env"),
    join(rootDir, "apps/web/.env.local"),
    join(rootDir, "apps/web/.dev.vars"),
  ];
  const env: Record<string, string> = {};
  for (const file of files) {
    if (!existsSync(file)) continue;
    Object.assign(env, parseEnv(readFileSync(file, "utf8")));
  }
  // Root .env.local owns the Facebook install. A later dev file must not
  // replace those keys.
  if (existsSync(envFile)) {
    const local = parseEnv(readFileSync(envFile, "utf8"));
    for (const [key, value] of Object.entries(local)) {
      if (key.startsWith("FACEBOOK_")) env[key] = value;
    }
  }
  return env;
}

function workerName(): string {
  if (!existsSync(wranglerFile)) {
    throw new Error("apps/web/wrangler.toml has no Worker name");
  }
  const match = readFileSync(wranglerFile, "utf8").match(
    /^name\s*=\s*"([^"]+)"/m
  );
  if (!match?.[1]) throw new Error("apps/web/wrangler.toml has no Worker name");
  return match[1];
}

async function graph(
  version: string,
  path: string,
  params: Record<string, string>,
  method: "GET" | "POST" = "GET"
): Promise<unknown> {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  const token = params.access_token;
  const rest = Object.fromEntries(
    Object.entries(params).filter(([key]) => key !== "access_token")
  );
  let requestBody: string | undefined;
  if (method === "POST") {
    requestBody = new URLSearchParams(rest).toString();
  } else {
    for (const [key, value] of Object.entries(rest)) {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(requestBody
        ? { "content-type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: requestBody,
  });
  const body = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const message =
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      parsed.error &&
      typeof parsed.error === "object" &&
      "message" in parsed.error
        ? String(parsed.error.message)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return parsed;
}

async function mint(
  env: Record<string, string>,
  userToken: string,
  secrets: string[]
): Promise<void> {
  const appId = env.FACEBOOK_APP_ID?.trim() ?? "";
  const appSecret = env.FACEBOOK_APP_SECRET?.trim() ?? "";
  if (!appId || !appSecret) {
    throw new Error(
      "FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be in .env.local"
    );
  }
  secrets.push(appId, appSecret, userToken);
  const version = env.FACEBOOK_GRAPH_VERSION?.trim() || "v26.0";
  const exchanged = (await graph(
    version,
    "oauth/access_token",
    {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: userToken,
    },
    "POST"
  )) as { access_token?: string };
  const longUser = exchanged.access_token ?? "";
  if (!longUser)
    throw new Error("Facebook did not return a long-lived user token");

  const accounts = (await graph(version, "me/accounts", {
    fields: "id,name,tasks,access_token",
    access_token: longUser,
  })) as { data?: FacebookPageAccount[] };
  const page = selectPage(accounts.data ?? [], env.FACEBOOK_PAGE_ID);
  const pageToken = page.access_token ?? "";
  if (!pageToken)
    throw new Error(`Page ${page.id} did not include an access token`);
  const tasks = new Set(page.tasks ?? []);
  if (tasks.size > 0 && !tasks.has("CREATE_CONTENT")) {
    throw new Error(`Page ${page.id} token cannot CREATE_CONTENT`);
  }

  // debug_token rejects the Page token as the caller. It wants an app
  // access token, or a user token from a developer of this app.
  secrets.push(pageToken, longUser, `${appId}|${appSecret}`);
  const debug = (await graph(version, "debug_token", {
    input_token: pageToken,
    access_token: `${appId}|${appSecret}`,
  })) as {
    data?: {
      type?: string;
      is_valid?: boolean;
      expires_at?: number;
      scopes?: string[];
      granular_scopes?: Array<{ scope?: string }>;
    };
  };
  const info = debug.data ?? {};
  const scopes = new Set(info.scopes ?? []);
  for (const entry of info.granular_scopes ?? []) {
    if (entry.scope) scopes.add(entry.scope);
  }
  if (info.type !== "PAGE" || info.is_valid !== true) {
    throw new Error("debug_token did not return a valid Page token");
  }
  if (!scopes.has("pages_manage_posts")) {
    throw new Error("Page token is missing pages_manage_posts");
  }

  const current = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  writeFileSync(
    envFile,
    upsertEnv(current, {
      FACEBOOK_APP_ID: appId,
      FACEBOOK_PAGE_ID: page.id,
      FACEBOOK_PAGE_ACCESS_TOKEN: pageToken,
    })
  );
  env.FACEBOOK_APP_ID = appId;
  env.FACEBOOK_PAGE_ID = page.id;
  env.FACEBOOK_PAGE_ACCESS_TOKEN = pageToken;
  console.log(
    `minted Page ${page.id} token ${mask(pageToken)} expires_at ${info.expires_at ?? 0}`
  );
}

function uploadWorker(env: Record<string, string>, keys: string[]): string[] {
  const token = env.CLOUDFLARE_API_TOKEN;
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required to sync"
    );
  }
  const skipped: string[] = [];
  let pending = [...keys];
  // A file, not `--body`. The bulk JSON holds the Page token and the app
  // secret, and `--body` puts that JSON on the process command line.
  const tmpFile = join(
    tmpdir(),
    `aidr-facebook-secrets-${process.pid}-${Date.now()}.json`
  );
  try {
    while (pending.length > 0) {
      const body = Object.fromEntries(
        pending.map((key) => [
          key,
          { type: "secret_text", name: key, text: env[key] },
        ])
      );
      writeFileSync(tmpFile, JSON.stringify({ secrets: body }), {
        mode: 0o600,
      });
      const result = spawnSync(
        "pnpm",
        [
          "exec",
          "cf",
          "workers",
          "secrets",
          "bulk",
          "--worker",
          workerName(),
          "--file",
          tmpFile,
        ],
        {
          cwd: join(rootDir, "apps/web"),
          encoding: "utf8",
          env: {
            ...process.env,
            CLOUDFLARE_API_TOKEN: token,
            CLOUDFLARE_ACCOUNT_ID: account,
          },
        }
      );
      if (result.status === 0) return skipped;
      const text = redactSecrets(
        `${result.stderr ?? ""}\n${result.stdout ?? ""}\n${result.error?.message ?? ""}`,
        Object.values(env)
      );
      const step = collisionSkip(pending, text);
      if (!step) {
        throw new Error(
          `Cloudflare secret upload failed: ${text.replace(/\s+/g, " ").trim().slice(0, 300)}`
        );
      }
      pending = step.keep;
      skipped.push(...step.skipped);
    }
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* the file is only there after the first write */
    }
  }
  return skipped;
}

function uploadGithub(env: Record<string, string>, keys: string[]): void {
  const repo = spawnSync(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
    { cwd: rootDir, encoding: "utf8" }
  );
  const name = repo.stdout.trim();
  if (repo.status !== 0 || !name) throw new Error("gh repo view failed");
  const githubEnv = env.GITHUB_ENVIRONMENT?.trim() || "production";
  for (const key of keys) {
    const targets: string[][] = [[]];
    if (githubEnv !== "repo") targets.unshift(["--env", githubEnv]);
    for (const extra of targets) {
      const result = spawnSync(
        "gh",
        ["secret", "set", key, "--repo", name, ...extra],
        { cwd: rootDir, input: env[key], encoding: "utf8" }
      );
      if (result.status !== 0) throw new Error(`GitHub secret ${key} failed`);
    }
  }
}

async function main(): Promise<void> {
  const secrets: string[] = [];
  try {
    await run(secrets);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(redactSecrets(message, secrets));
    process.exit(1);
  }
}

async function run(secrets: string[]): Promise<void> {
  const env = loadEnv();
  secrets.push(...Object.values(env));
  const userToken = argValue("--user-token") ?? env.FACEBOOK_USER_TOKEN ?? "";
  if (userToken) secrets.push(userToken);
  if (userToken) await mint(env, userToken, secrets);
  else if (!sync) {
    throw new Error(
      "Pass --user-token, or set FACEBOOK_USER_TOKEN. Use --sync to upload an existing Page token."
    );
  }
  if (!sync) return;
  const keys = [
    "FACEBOOK_PAGE_ID",
    "FACEBOOK_APP_ID",
    "FACEBOOK_APP_SECRET",
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "FACEBOOK_GRAPH_VERSION",
    "SITE_URL",
  ].filter((key) => env[key]);
  if (keys.length === 0)
    throw new Error("No Facebook keys in .env.local to sync");
  const skipped = uploadWorker(env, keys);
  uploadGithub(env, keys);
  const uploaded = keys.filter((key) => !skipped.includes(key));
  console.log(`worker secrets: ${uploaded.join(", ") || "none"}`);
  console.log(`github secrets: ${keys.join(", ")}`);
  if (skipped.length > 0) {
    console.log(
      `left as Worker vars (remove them from wrangler.toml and deploy, then sync again): ${skipped.join(", ")}`
    );
  }
}

void main();
