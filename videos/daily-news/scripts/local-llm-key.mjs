// The one place a local script gets its AnyRouter key.
//
// Why: on 2026-10-13 local evals read ANYROUTER_API_KEY from .env.local. That
// is the same value `pnpm sync-env` pushes as the production Worker secret, so
// the evals spent the production plan's 3000 requests per 5 hours and the
// 21:04 UTC ingest got 429s on clustering, scoring and translation (#656).
//
// Decision:
// - Local runs (CI unset) read ANYROUTER_LOCAL_API_KEY only, from the process
//   env or the repo-root .env.local. With just ANYROUTER_API_KEY present they
//   refuse to start. A wrong guess here costs production quota, so there is no
//   fallback to the production key.
// - CI (CI=true) reads ANYROUTER_API_KEY. A workflow such as daily-reel.yml
//   injects its own repository secret, not the key of a developer machine.
// - scripts/sync-env.ts (repo root) never pushes ANYROUTER_LOCAL_API_KEY anywhere.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_KEY_VAR = "ANYROUTER_LOCAL_API_KEY";
export const PROD_KEY_VAR = "ANYROUTER_API_KEY";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** `KEY=value` pairs of the repo-root .env.local, or {} when it is missing. */
export function readEnvLocal(file = join(REPO, ".env.local")) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/**
 * `{ key }` or `{ error }`. Pure: the caller passes the process env and the
 * parsed .env.local, so tests need no files and no process exit.
 */
export function resolveLlmKey(env, fileVars = {}) {
  if (env.CI === "true") {
    const key = env[PROD_KEY_VAR];
    return key
      ? { key }
      : {
          error: `${PROD_KEY_VAR} is not set in CI (check the workflow secret)`,
        };
  }
  const key = env[LOCAL_KEY_VAR] || fileVars[LOCAL_KEY_VAR];
  if (key) return { key };
  const hasProd = Boolean(env[PROD_KEY_VAR] || fileVars[PROD_KEY_VAR]);
  return {
    error:
      `${LOCAL_KEY_VAR} is not set. Local scripts must not use the production key${hasProd ? ` (${PROD_KEY_VAR} is present and was ignored)` : ""}: ` +
      `it shares the production AnyRouter quota (#656). Create a second AnyRouter key and put it in .env.local as ${LOCAL_KEY_VAR}=...`,
  };
}

/**
 * The daily video must post even without a model: in CI a missing key falls
 * back to the template script (`{ fallback }`) instead of failing the run.
 * Locally a missing key is still an error, so the production key is never used.
 */
export function videoScriptKey(env, fileVars = {}) {
  const r = resolveLlmKey(env, fileVars);
  if (r.error && env.CI === "true") return { fallback: r.error };
  return r;
}

/** The key for this run, or exit 1 with the reason. Never prints the key. */
export function requireLlmKey(env = process.env, fileVars = readEnvLocal()) {
  const r = resolveLlmKey(env, fileVars);
  if (r.error) {
    console.error(`error: ${r.error}`);
    process.exit(1);
  }
  return r.key;
}
