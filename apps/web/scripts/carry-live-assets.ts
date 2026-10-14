#!/usr/bin/env tsx
/**
 * Runs between the build's checks and `wrangler deploy`. Copies the live
 * site's still-retained `/assets/*` files into `dist/client/assets` and writes
 * the merged `dist/client/asset-history.json`, so cached HTML from earlier
 * builds keeps loading its chunks after this deploy (see
 * src/lib/deploy-assets.ts).
 *
 * Usage: tsx scripts/carry-live-assets.ts [--base https://aidr.today]
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSET_HISTORY_PATH,
  carryLiveAssets,
  readBuildAssets,
  writeCarriedAsset,
} from "../src/lib/deploy-assets";

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

async function main() {
  const base = parseBase(process.argv.slice(2));
  const result = await carryLiveAssets({
    base,
    built: readBuildAssets(clientRoot),
    now: Date.now(),
    save: (path, bytes) => writeCarriedAsset(clientRoot, path, bytes),
    warn: (message) =>
      console.log(
        process.env.GITHUB_ACTIONS === "true"
          ? `::warning::${message}`
          : `WARNING ${message}`
      ),
  });

  writeFileSync(
    join(clientRoot, ASSET_HISTORY_PATH),
    `${JSON.stringify(result.history)}\n`
  );
  console.log(
    `Carried ${result.carried}/${result.attempted} earlier asset(s) from ${base}; history lists ${result.history.built.length} built and ${Object.keys(result.history.retired).length} retired`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
