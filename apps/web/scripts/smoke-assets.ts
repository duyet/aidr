#!/usr/bin/env tsx
/**
 * Post-deploy check that every `/assets/*` file the live HTML references
 * loads. Fetches the home, a day and a story page twice: once at the canonical
 * URL, which is what visitors get from the CDN and Worker caches (possibly
 * HTML from the previous build, the issue #702 case), and once cache-busted,
 * which is the new build's own HTML.
 *
 * Usage: tsx scripts/smoke-assets.ts [--base https://aidr.today]
 */
import { assetRefs, deployCheckPages } from "../src/lib/deploy-assets";

const DEFAULT_BASE = "https://aidr.today";
const ATTEMPTS = 5;
const RETRY_DELAY_MS = 6000;

function parseBase(argv: string[]): string {
  const i = argv.indexOf("--base");
  return (i !== -1 && argv[i + 1] ? argv[i + 1] : DEFAULT_BASE).replace(
    /\/$/,
    ""
  );
}

async function html(url: string): Promise<string> {
  const res = await fetch(url, { headers: { accept: "text/html" } });
  if (res.status !== 200) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

/** Every failure across the pages, empty when all assets load. */
async function brokenAssets(base: string): Promise<string[]> {
  const pages = deployCheckPages(await html(`${base}/?lang=en`));
  const bust = `smoke=${Date.now()}`;
  const urls = [
    ...pages.map((page) => `${base}${page}`),
    ...pages.map((page) => `${base}${page}&${bust}`),
  ];

  // First referrer wins, so a failure names the cached page when there is one.
  const refs = new Map<string, string>();
  for (const url of urls) {
    for (const ref of assetRefs(await html(url))) {
      if (!refs.has(ref)) refs.set(ref, url);
    }
  }
  if (refs.size === 0) return ["no /assets/* references found in any page"];

  const failures: string[] = [];
  await Promise.all(
    [...refs].map(async ([ref, page]) => {
      const res = await fetch(`${base}${ref}`);
      await res.body?.cancel();
      const type = res.headers.get("content-type") ?? "";
      if (res.status !== 200 || type.startsWith("text/html")) {
        failures.push(`${ref} -> HTTP ${res.status} ${type} (from ${page})`);
      }
    })
  );
  console.log(`Checked ${refs.size} asset(s) across ${urls.length} page(s)`);
  return failures.sort();
}

async function main() {
  const base = parseBase(process.argv.slice(2));
  let failures: string[] = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      failures = await brokenAssets(base);
    } catch (e) {
      failures = [e instanceof Error ? e.message : String(e)];
    }
    if (failures.length === 0) {
      console.log("OK every referenced /assets/* file returns 200");
      return;
    }
    console.log(`Attempt ${attempt}/${ATTEMPTS} failed:`);
    for (const failure of failures) console.log(`  ${failure}`);
    if (attempt < ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  console.error(`::error::${failures.length} referenced asset(s) failed`);
  process.exit(1);
}

main();
