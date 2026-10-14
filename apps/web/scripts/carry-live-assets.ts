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
import { ASSET_HISTORY_PATH, carryLiveAssets } from "../src/lib/deploy-assets";

const DEFAULT_BASE = "https://aidr.today";

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

async function main() {
  const base = parseBase(process.argv.slice(2));
  const result = await carryLiveAssets({
    base,
    built: builtAssets(),
    now: Date.now(),
    save: (path, bytes) => {
      const out = join(clientRoot, path);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, bytes);
    },
    warn: (message) => console.log(`::warning::${message}`),
  });

  writeFileSync(
    join(clientRoot, ASSET_HISTORY_PATH),
    `${JSON.stringify(result.history)}\n`
  );
  console.log(
    `Carried ${result.carried}/${result.attempted} earlier asset(s) from ${base}; history lists ${Object.keys(result.history).length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
