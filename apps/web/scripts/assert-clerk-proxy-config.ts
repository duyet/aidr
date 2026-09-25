#!/usr/bin/env tsx
/**
 * Verify that the browser build and generated Worker config use the one
 * canonical Clerk proxy URL from wrangler.toml.
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

console.log(`Clerk proxy config assertion passed (${canonicalUrl})`);
