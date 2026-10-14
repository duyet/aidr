#!/usr/bin/env tsx
/**
 * Verify the artifact `wrangler deploy` actually uploads.
 *
 * Three things, each of which fails silently or only on master otherwise:
 *
 * 1. `dist/server/wrangler.json` must exist. `wrangler deploy` reads this exact
 *    file, so a build that "succeeded" without it fails at the deploy step.
 *
 * 2. The story OG fonts must be present under `dist/client/fonts/`. The card
 *    route reads them through the `ASSETS` binding at the paths in
 *    `src/lib/og-fonts.ts`; if they never reach the artifact, satori gets an
 *    empty font list, fetches a fallback face over the network mid-render, and
 *    Vietnamese headlines come back in two typefaces. `og-fonts.test.ts` reads
 *    the source tree, so it stays green either way — this is the only gate that
 *    covers the copy into the artifact.
 *
 * 3. Every `dist/client/assets` entry must be a flat file name the deploy's
 *    carry step can publish (`readBuildAssets` in `src/lib/deploy-assets.ts`).
 *    The carry runs only on the master deploy, so without this a new
 *    build-output name passes the PR and then fails the deploy. An extension
 *    the carry refuses (`MEDIA_TYPES`, e.g. `.map`, `.wasm`) fails here too,
 *    since the carry would silently drop that file after deploy.
 *
 * Runs in `validate:deploy-artifact`, so it is the same check locally and in
 * CI, after the same build.
 */
import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readBuildAssets, uncarriableAssets } from "../src/lib/deploy-assets";
import { STORY_OG_FONT_SOURCES } from "../src/lib/og-fonts";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const clientRoot = join(webRoot, "dist/client");

function fail(message: string): never {
  throw new Error(`Deploy artifact assertion failed: ${message}`);
}

function nonEmpty(path: string): boolean {
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

const generatedConfig = join(webRoot, "dist/server/wrangler.json");
if (!nonEmpty(generatedConfig)) {
  fail(
    "dist/server/wrangler.json is missing or empty; wrangler deploy would fail"
  );
}
console.log(
  `Verified ${statSync(generatedConfig).size} bytes in dist/server/wrangler.json`
);

for (const [weight, path] of Object.entries(STORY_OG_FONT_SOURCES)) {
  const built = join(clientRoot, path);
  if (!nonEmpty(built)) {
    fail(
      `${path} (wght ${weight}) is missing or empty in dist/client. The OG card ` +
        `route reads it through the ASSETS binding; without it satori falls back to ` +
        `a network font and Vietnamese headlines render in two typefaces.`
    );
  }
  console.log(`Verified ${statSync(built).size} bytes in dist/client${path}`);
}

try {
  const assets = readBuildAssets(clientRoot);
  const refused = uncarriableAssets(assets);
  if (refused.length > 0) {
    throw new Error(
      `the build emits asset(s) whose extension the deploy carry refuses and would drop: ${refused.join(", ")}. Add the type to MEDIA_TYPES in src/lib/deploy-assets.ts, or stop emitting it.`
    );
  }
  console.log(
    `Verified ${assets.length} carry-safe names in dist/client/assets`
  );
} catch (e) {
  fail((e as Error).message);
}

console.log("Deploy artifact assertion passed");
