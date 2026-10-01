#!/usr/bin/env tsx
/**
 * Verify that the browser build and generated Worker config use the one
 * canonical Clerk proxy URL from wrangler.toml, and that the browser bundle
 * carries a production publishable key.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveClerkProxyUrl } from "../src/lib/clerk-proxy-config";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readWranglerVar(contents: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escapedName}\\s*=\\s*"([^"]*)"\\s*$`, "m").exec(
    contents
  )?.[1];
}

function fail(message: string): never {
  throw new Error(`Clerk proxy config assertion failed: ${message}`);
}

const canonicalUrl = resolveClerkProxyUrl(
  readWranglerVar(
    readFileSync(join(webRoot, "wrangler.toml"), "utf8"),
    "CLERK_PROXY_URL"
  )
);
if (!canonicalUrl) fail("wrangler.toml has no valid CLERK_PROXY_URL");

const generatedPath = join(webRoot, "dist/server/wrangler.json");
let generated: { vars?: Record<string, unknown> };
try {
  generated = JSON.parse(readFileSync(generatedPath, "utf8")) as {
    vars?: Record<string, unknown>;
  };
} catch {
  fail("dist/server/wrangler.json was not generated");
}

if (generated.vars?.VITE_CLERK_PROXY_URL !== undefined) {
  fail("generated config contains a second browser URL source");
}
const generatedUrl = resolveClerkProxyUrl(
  typeof generated.vars?.CLERK_PROXY_URL === "string"
    ? generated.vars.CLERK_PROXY_URL
    : undefined
);
if (generatedUrl !== canonicalUrl) {
  fail("generated CLERK_PROXY_URL does not match wrangler.toml");
}

function containsCanonicalUrl(path: string): boolean {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      if (containsCanonicalUrl(entryPath)) return true;
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      if (readFileSync(entryPath, "utf8").includes(canonicalUrl)) return true;
    }
  }
  return false;
}

if (!containsCanonicalUrl(join(webRoot, "dist/client"))) {
  fail("browser bundle does not contain the canonical proxy URL");
}

// A `pk_test_` key makes ClerkJS load its development bundle, which the
// production Frontend API rejects with "This request isn't valid for this
// instance type" — the proxy 400s and sign-in dies for every reader while the
// build itself looks healthy. The key is inlined into the bundle, so grep the
// shipped output rather than trusting whatever env the build ran with.
//
// Match a real key, not the bare literal: the Clerk SDK ships its own
// `pk_test_`/`pk_live_` format-check strings, so a plain substring search
// would fail every build. A publishable key is the prefix plus a long base64
// payload. Only the offending chunk path is reported, never the key.
const DEV_PUBLISHABLE_KEY = /pk_test_[A-Za-z0-9_-]{20,}\$?/;

function findDevPublishableKey(path: string): string | null {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      const found = findDevPublishableKey(entryPath);
      if (found) return found;
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      if (DEV_PUBLISHABLE_KEY.test(readFileSync(entryPath, "utf8"))) {
        return entryPath;
      }
    }
  }
  return null;
}

const devKeyChunk = findDevPublishableKey(join(webRoot, "dist/client"));
if (devKeyChunk) {
  fail(
    `browser bundle ships a Clerk development key in ${devKeyChunk.replace(
      `${webRoot}/`,
      ""
    )}; production needs VITE_CLERK_PUBLISHABLE_KEY=pk_live_… (check the GitHub Actions secret of the same name)`
  );
}

// A bundle with no key at all builds and serves fine, but ClerkRootProvider
// never mounts Clerk, so sign-in shows an empty card. That shipped from a
// local deploy on 2026-10-01. PR builds have no key on purpose, so only the
// deploy path asks for one with --require-live-key.
const LIVE_PUBLISHABLE_KEY = /pk_live_[A-Za-z0-9_-]{20,}\$?/;

function containsLiveKey(path: string): boolean {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      if (containsLiveKey(entryPath)) return true;
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      if (LIVE_PUBLISHABLE_KEY.test(readFileSync(entryPath, "utf8")))
        return true;
    }
  }
  return false;
}

if (
  process.argv.includes("--require-live-key") &&
  !containsLiveKey(join(webRoot, "dist/client"))
) {
  fail(
    "browser bundle has no Clerk publishable key; set VITE_CLERK_PUBLISHABLE_KEY=pk_live_… in the repo-root .env.local or the environment before deploying"
  );
}

console.log(`Clerk proxy config assertion passed (${canonicalUrl})`);
