/**
 * Regenerate the raster favicon assets from `public/favicon.svg`.
 *
 * `favicon.svg` is the single source of truth for the mark: the AI;DR wordmark
 * is outlined as vector paths, so the file rasterizes identically on a search
 * engine's font-less favicon pipeline. Everything else here is derived from it.
 *
 * Yandex Webmaster asks for "SVG format or 120 x 120 pixels"; we ship both, plus
 * the apple-touch-icon and a real multi-size favicon.ico so root-convention
 * crawlers stop following a redirect into an SVG.
 *
 * Authoring-time only — the test suite reads the committed files and never runs
 * this.
 *
 *   pnpm --filter @aidr/web gen:favicon
 *
 * `sharp` (libvips + librsvg) reaches the workspace through `miniflare`, an
 * existing @aidr/web devDependency, so this adds no dependency of its own — the
 * same arrangement as scripts/generate-webp-lossless-fixtures.ts.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const PUBLIC_DIR = resolve(import.meta.dirname, "../public");

/** Yandex's requested raster size, per its favicon documentation. */
const YANDEX_SIZE = 120;
/** Apple's home-screen icon size. */
const APPLE_TOUCH_SIZE = 180;
/** Frame sizes packed into favicon.ico. */
const ICO_SIZES = [16, 32, 48];

/**
 * librsvg renders at `density`/72 x the SVG's intrinsic size. The source is a
 * 32x32 mark, so the default 72 dpi would rasterize a 120 px target from a
 * 32 px canvas and upscale the edges. Render large, then let libvips box-filter
 * down to the exact target.
 */
const SUPERSAMPLE = 4;

const YELLOW = "#f5c518";
const INK = "#1c1917";

/** Render the committed favicon.svg to a square PNG of `size` pixels. */
async function renderPng(size: number): Promise<Buffer> {
  const svg = await readFile(resolve(PUBLIC_DIR, "favicon.svg"));
  return sharp(svg, { density: 72 * SUPERSAMPLE })
    .resize(size, size, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Build an ICO container around PNG frames. PNG-in-ICO has been readable by
 * every shipping browser since Windows Vista, and it keeps this script free of
 * a BMP encoder.
 */
function buildIco(frames: Array<{ size: number; png: Buffer }>): Buffer {
  const HEADER = 6;
  const ENTRY = 16;
  const dir = Buffer.alloc(HEADER + ENTRY * frames.length);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // type 1 = icon
  dir.writeUInt16LE(frames.length, 4);

  let offset = dir.length;
  frames.forEach((frame, i) => {
    const at = HEADER + ENTRY * i;
    dir.writeUInt8(frame.size === 256 ? 0 : frame.size, at + 0); // 0 means 256
    dir.writeUInt8(frame.size === 256 ? 0 : frame.size, at + 1);
    dir.writeUInt8(0, at + 2); // palette size
    dir.writeUInt8(0, at + 3); // reserved
    dir.writeUInt16LE(1, at + 4); // color planes
    dir.writeUInt16LE(32, at + 6); // bits per pixel
    dir.writeUInt32LE(frame.png.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += frame.png.length;
  });

  return Buffer.concat([dir, ...frames.map((frame) => frame.png)]);
}

/** Fail loudly rather than shipping a mark that lost or clipped its wordmark. */
async function assertInk(png: Buffer, size: number, label: string) {
  const { data, info } = await sharp(png)
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== size || info.height !== size) {
    throw new Error(
      `${label}: expected ${size}x${size}, got ${info.width}x${info.height}`
    );
  }
  // Classify each pixel as closer to the ink colour than to the brand yellow, so
  // the antialiased edge is ignored. Fully transparent pixels must be skipped
  // first: unpremultiplied RGBA reads them as black, which sits closer to the ink
  // colour than to yellow and would otherwise count the whole corner radius.
  let ink = 0;
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * info.width + x) * info.channels;
      if (info.channels === 4 && data[i + 3] < 128) continue;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const toInk =
        Math.abs(r - 0x1c) + Math.abs(g - 0x19) + Math.abs(b - 0x17);
      const toYellow =
        Math.abs(r - 0xf5) + Math.abs(g - 0xc5) + Math.abs(b - 0x18);
      if (toInk < toYellow) {
        ink += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const share = (100 * ink) / (size * size);
  if (share < 4) {
    throw new Error(
      `${label}: wordmark missing (only ${share.toFixed(2)}% ink)`
    );
  }
  // The wordmark must sit inside the square with a visible margin, otherwise the
  // rounded rect clips it and the mark reads as a truncated word.
  const margin = Math.max(1, Math.round(size * 0.04));
  if (
    minX < margin ||
    minY < margin ||
    maxX > size - 1 - margin ||
    maxY > size - 1 - margin
  ) {
    throw new Error(
      `${label}: wordmark is clipped or flush to the edge ` +
        `(ink box x=${minX}..${maxX} y=${minY}..${maxY}, need ${margin}px margin)`
    );
  }
  return share;
}

const outputs: Array<{ file: string; size: number; share: number }> = [];

const yandex = await renderPng(YANDEX_SIZE);
outputs.push({
  file: "favicon-120x120.png",
  size: YANDEX_SIZE,
  share: await assertInk(yandex, YANDEX_SIZE, "favicon-120x120.png"),
});

const apple = await renderPng(APPLE_TOUCH_SIZE);
outputs.push({
  file: "apple-touch-icon.png",
  size: APPLE_TOUCH_SIZE,
  share: await assertInk(apple, APPLE_TOUCH_SIZE, "apple-touch-icon.png"),
});

const frames = await Promise.all(
  ICO_SIZES.map(async (size) => ({ size, png: await renderPng(size) }))
);
for (const frame of frames) {
  await assertInk(frame.png, frame.size, `favicon.ico ${frame.size}`);
}
const ico = buildIco(frames);

await writeFile(resolve(PUBLIC_DIR, "favicon-120x120.png"), yandex);
await writeFile(resolve(PUBLIC_DIR, "apple-touch-icon.png"), apple);
await writeFile(resolve(PUBLIC_DIR, "favicon.ico"), ico);

for (const out of outputs) {
  console.log(
    `${out.file.padEnd(22)} ${out.size}x${out.size}  ink ${out.share.toFixed(2)}%`
  );
}
console.log(
  `favicon.ico            ${frames.map((f) => `${f.size}`).join("/")}  ${ico.length} bytes`
);
console.log(`(mark fill ${YELLOW} on ${INK} — see public/favicon.svg)`);
