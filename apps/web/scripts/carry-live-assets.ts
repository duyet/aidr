#!/usr/bin/env tsx
/**
 * Runs between `vite build` and `wrangler deploy`. Copies the live site's
 * still-retained `/assets/*` files into `dist/client/assets` and writes the
 * merged `dist/client/asset-history.json`, so cached HTML from earlier builds
 * keeps loading its chunks after this deploy (see src/lib/deploy-assets.ts).
 *
 * Usage: tsx scripts/carry-live-assets.ts [--base https://aidr.today]
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSET_HISTORY_PATH,
  type AssetHistory,
  assetRefs,
  parseAssetHistory,
  planAssetCarry,
} from "../src/lib/deploy-assets";

const DEFAULT_BASE = "https://aidr.today";
const ATTEMPTS = 3;
const CONCURRENCY = 8;
const SEED_PAGES = ["/?lang=en", "/?lang=vi"];

const clientRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url)),
  "dist/client"
);

function parseBase(argv: string[]): string {
  const i = argv.indexOf("--base");
  return (i !== -1 && argv[i + 1] ? argv[i + 1] : DEFAULT_BASE).replace(
    /\/$/,
    ""
  );
}

function builtAssets(): string[] {
  return readdirSync(join(clientRoot, "assets"), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `assets/${entry.name}`);
}

/**
 * Without a history file (the first deploy with one, or a deploy that skipped
 * this step) fall back to what the cached home pages load right now.
 */
async function seedFromHomePages(
  base: string,
  now: number
): Promise<AssetHistory> {
  const seed: Record<string, number> = {};
  for (const page of SEED_PAGES) {
    const res = await fetch(`${base}${page}`, {
      headers: { accept: "text/html" },
    });
    if (!res.ok) throw new Error(`GET ${page} -> HTTP ${res.status}`);
    for (const ref of assetRefs(await res.text())) seed[ref.slice(1)] = now;
  }
  return parseAssetHistory(seed);
}

async function liveHistory(base: string, now: number): Promise<AssetHistory> {
  const res = await fetch(`${base}/${ASSET_HISTORY_PATH}?t=${now}`, {
    headers: { "cache-control": "no-cache" },
  });
  if (res.status === 404) {
    console.log(
      `::warning::${base}/${ASSET_HISTORY_PATH} not found; seeding from ${SEED_PAGES.join(", ")}`
    );
    return seedFromHomePages(base, now);
  }
  if (!res.ok) {
    throw new Error(`GET ${ASSET_HISTORY_PATH} -> HTTP ${res.status}`);
  }
  return parseAssetHistory(await res.json());
}

async function download(base: string, path: string): Promise<Uint8Array> {
  let reason = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${base}/${path}`);
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && !type.startsWith("text/html")) {
        return new Uint8Array(await res.arrayBuffer());
      }
      reason = `HTTP ${res.status} ${type}`;
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`GET /${path} failed after ${ATTEMPTS} attempts: ${reason}`);
}

async function main() {
  const base = parseBase(process.argv.slice(2));
  const now = Date.now();
  const plan = planAssetCarry(builtAssets(), await liveHistory(base, now), now);

  const failed: string[] = [];
  const queue = [...plan.carry];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let path = queue.shift(); path; path = queue.shift()) {
        try {
          const bytes = await download(base, path);
          const out = join(clientRoot, path);
          mkdirSync(dirname(out), { recursive: true });
          writeFileSync(out, bytes);
        } catch (e) {
          failed.push(path);
          console.log(`::warning::not carried: ${(e as Error).message}`);
        }
      }
    })
  );
  for (const path of failed) delete plan.history[path];

  writeFileSync(
    join(clientRoot, ASSET_HISTORY_PATH),
    `${JSON.stringify(plan.history)}\n`
  );
  console.log(
    `Carried ${plan.carry.length - failed.length}/${plan.carry.length} earlier asset(s) from ${base}; history lists ${Object.keys(plan.history).length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
