#!/usr/bin/env tsx
/**
 * Verify the artifact `wrangler deploy` actually uploads.
 *
 * Two things, both of which fail silently otherwise:
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
 * Runs in `validate:deploy-artifact`, so it is the same check locally and in
 * CI, after the same build.
 */
import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

console.log("Deploy artifact assertion passed");
