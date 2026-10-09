#!/usr/bin/env tsx
/**
 * Upload apps/extension/dist/aidr-cws.zip to the existing Chrome Web Store
 * item and submit it for review (Chrome Web Store API v2).
 *
 * The API covers the package only. Listing text, screenshots and promo
 * tiles are changed by hand in the dashboard (see apps/extension/STORE.md).
 *
 * Env: CWS_PUBLISHER_ID (dashboard → Publisher → Settings; also the first
 *      id in the dashboard URL), CWS_CLIENT_ID, CWS_CLIENT_SECRET,
 *      CWS_REFRESH_TOKEN (OAuth client with scope
 *      https://www.googleapis.com/auth/chromewebstore)
 *
 * Usage:
 *   pnpm --filter @aidr/web cws-publish            # upload + publish
 *   pnpm --filter @aidr/web cws-publish --status   # fetch status only
 *   pnpm --filter @aidr/web cws-publish --upload-only
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultCwsZipDest } from "../src/lib/aidr-zip";

const ITEM_ID = "cagjehdlblcobkghgbbilnpefelbmpcg";
const API = "https://chromewebstore.googleapis.com";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const ITEM = `publishers/${env("CWS_PUBLISHER_ID")}/items/${ITEM_ID}`;

async function accessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env("CWS_CLIENT_ID"),
      client_secret: env("CWS_CLIENT_SECRET"),
      refresh_token: env("CWS_REFRESH_TOKEN"),
    }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(
      `token exchange failed: ${res.status} ${JSON.stringify(body)}`
    );
  }
  return body.access_token;
}

async function call(
  token: string,
  method: string,
  url: string,
  body?: Uint8Array
): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const token = await accessToken();
  const status = () => call(token, "GET", `${API}/v2/${ITEM}:fetchStatus`);

  if (args.has("--status")) {
    console.log(JSON.stringify(await status(), null, 2));
    return;
  }

  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const zip = readFileSync(defaultCwsZipDest(webRoot));
  console.log(`uploading ${zip.byteLength} bytes`);
  console.log(
    JSON.stringify(
      await call(token, "POST", `${API}/upload/v2/${ITEM}:upload`, zip),
      null,
      2
    )
  );
  if (args.has("--upload-only")) return;

  console.log(
    JSON.stringify(
      await call(token, "POST", `${API}/v2/${ITEM}:publish`),
      null,
      2
    )
  );
  console.log(JSON.stringify(await status(), null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
