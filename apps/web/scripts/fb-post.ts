#!/usr/bin/env tsx
/**
 * Post one link to the AI;DR Facebook Page — e.g. a new YouTube film or a
 * day page — with a message read from a file. For releases prefer
 * `fb-post-release`, which builds the message from the release content.
 *
 * Env (from .env.local): FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN,
 * optional FACEBOOK_GRAPH_VERSION (default v26.0).
 *
 * Usage:
 *   pnpm --filter @aidr/web fb-post --link <url> --message-file <path> [--dry-run]
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const link = flag("--link");
const file = flag("--message-file");
if (!link || !file) {
  console.error(
    "usage: fb-post --link <url> --message-file <path> [--dry-run]"
  );
  process.exit(1);
}
const message = readFileSync(file, "utf8").trim();
console.log(`${message}\n\nlink: ${link}`);
if (args.includes("--dry-run")) process.exit(0);

const pageId = process.env.FACEBOOK_PAGE_ID;
const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
if (!pageId || !token) {
  console.error("FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN must be set");
  process.exit(1);
}
const graph = process.env.FACEBOOK_GRAPH_VERSION || "v26.0";
const res = await fetch(
  `https://graph.facebook.com/${graph}/${encodeURIComponent(pageId)}/feed`,
  {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ message, link }),
  }
);
const body = await res.text();
if (!res.ok) {
  console.error(`Facebook post failed: ${res.status} ${body}`);
  process.exit(1);
}
console.log(`posted: ${body}`);
