/**
 * Regenerate the real lossless WebP (VP8L) test fixtures.
 *
 * Authoring-time only — the test suite reads the committed files and never
 * runs this. VP8L is the one WebP variant whose canvas size is packed into the
 * bitstream header rather than a dedicated chunk, so the fixtures are pinned to
 * genuine libwebp output rather than a hand-rolled guess.
 *
 * Each file is decoded back through libwebp before it is written, so a fixture
 * can never claim dimensions it does not actually have.
 *
 *   pnpm exec tsx --tsconfig apps/web/tsconfig.json \
 *     apps/web/scripts/generate-webp-lossless-fixtures.ts
 *
 * `sharp` (which wraps libwebp) reaches the workspace through `miniflare`, an
 * existing @aidr/web devDependency, so this adds no dependency of its own.
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { readRasterContainer } from "../src/lib/story-og-image";

const OUT = resolve(import.meta.dirname, "../src/lib/__fixtures__");

/** Deliberately includes one size past the accepted side ceiling. */
const CASES: Array<{ width: number; height: number; alpha?: boolean }> = [
  { width: 1, height: 1 },
  { width: 16, height: 16 },
  { width: 300, height: 200 },
  { width: 1200, height: 630 },
  { width: 1024, height: 13 },
  { width: 255, height: 257 },
  { width: 4096, height: 1 },
  { width: 4097, height: 1 },
  { width: 300, height: 200, alpha: true },
];

let mismatches = 0;

for (const { width, height, alpha } of CASES) {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha
        ? { r: 200, g: 10, b: 10, alpha: 0.5 }
        : { r: 12, g: 34, b: 56 },
    },
  })
    .webp({ lossless: true, effort: 0 })
    .toBuffer();

  // Ground truth: libwebp decodes its own output.
  const meta = await sharp(buffer).metadata();
  const decodes = meta.width === width && meta.height === height;

  const name = `webp-lossless-${width}x${height}${alpha ? "-alpha" : ""}.webp`;
  const parsed = readRasterContainer(new Uint8Array(buffer));
  const overCeiling = width > 4096;
  const parsedOk = overCeiling
    ? parsed === null
    : parsed?.width === width && parsed?.height === height;

  if (!decodes || !parsedOk) mismatches += 1;
  await writeFile(resolve(OUT, name), buffer);

  console.log(
    [
      name.padEnd(34),
      `${String(buffer.length).padStart(3)}B`,
      `chunk=${buffer.subarray(12, 16).toString("latin1")}`,
      `libwebp=${meta.width}x${meta.height} ${decodes ? "ok" : "BAD"}`,
      `parser=${parsed ? `${parsed.width}x${parsed.height}` : "rejected"} ${
        parsedOk ? "ok" : "BAD"
      }`,
    ].join("  ")
  );
}

if (mismatches > 0) {
  throw new Error(`${mismatches} fixture(s) failed verification`);
}
console.log(`\nwrote ${CASES.length} fixtures to ${OUT}`);
