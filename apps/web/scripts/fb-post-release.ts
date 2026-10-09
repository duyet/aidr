#!/usr/bin/env tsx
/**
 * Post a release to the AI;DR Facebook Page: one link post to
 * /release/vX.Y.Z (Facebook builds the preview from the page's OG cover),
 * with a short message built from the release content.
 *
 * Env (from .env.local): FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN,
 * optional FACEBOOK_GRAPH_VERSION (default v26.0).
 *
 * Usage:
 *   pnpm --filter @aidr/web fb-post-release v0.1.12 --dry-run
 *   pnpm --filter @aidr/web fb-post-release v0.1.12
 *   pnpm --filter @aidr/web fb-post-release v0.1.12 --lang vi
 */
import { findRelease, releasePath } from "../src/lib/releases/index";
import { SITE_URL } from "../src/lib/site";

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const lang = args.includes("--lang") ? args[args.indexOf("--lang") + 1] : "en";
if (lang !== "en" && lang !== "vi") throw new Error("--lang must be en or vi");

const release = version ? findRelease(version) : undefined;
if (!release) {
  console.error(`unknown release: ${version ?? "(none)"}`);
  process.exit(1);
}

const t = (s: { en: string; vi: string }) => s[lang];
// Always name the language: without ?lang the page's OG tags fall back to
// Vietnamese and Facebook builds a Vietnamese preview for the English post.
const link = `${SITE_URL}${releasePath(release)}?lang=${lang}`;
const film =
  (lang === "vi" ? release.youtubeIdVi : undefined) ?? release.youtubeId;
const highlights = release.highlights
  .slice(0, 5)
  .map((h) => `• ${t(h.label)}`)
  .join("\n");
const message = [
  `AI;DR v${release.version}: ${t(release.title)}`,
  "",
  t(release.intro),
  "",
  highlights,
  film
    ? `\n${lang === "vi" ? "Xem video" : "Watch"}: https://youtu.be/${film}`
    : "",
  `${lang === "vi" ? "Chi tiết" : "Full notes"}: ${link}`,
]
  .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
  .join("\n")
  .trim();

console.log(message);
console.log(`\nlink: ${link}`);
if (dryRun) process.exit(0);

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
