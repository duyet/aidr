/**
 * Build-time subset of Source Sans 3 latin-ext. Issue #229.
 *
 * Fontsource's latin-ext file is 60,088 B and covers ~1,000 code points:
 * Latin Extended-A/B, IPA, Latin Extended Additional, Extended-C/D and more.
 * Its unicode-range also overlaps the Vietnamese letters (ă đ ĩ ũ ơ ư and
 * U+1EF2-1EF9), so every Vietnamese page downloaded all of it.
 *
 * Scanning the live /?lang=vi, /?lang=en and /api/feed?days=14 (en + vi)
 * found exactly three code points that need this face: ā (U+0101),
 * ō (U+014D) and ₹ (U+20B9). This keeps Latin Extended-A (European names and
 * loanword macrons), the currency block and the two symbols Fontsource's
 * range adds, and drops everything else. A character outside every range
 * still renders, in the metric-matched "Source Sans 3 Fallback" face.
 *
 * The output is generated from node_modules on every dev/build start (the
 * `subset-fonts` plugin in vite.config.ts), so a Fontsource upgrade can
 * never leave a stale committed copy behind. It is gitignored.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

/**
 * Code points the subset keeps, as inclusive [lo, hi] pairs. Must match the
 * `unicode-range` of the latin-ext face in src/fonts.css exactly
 * (asserted by src/lib/fonts.test.ts). The Vietnamese letters inside
 * Extended-A are left out: the vietnamese face already covers them, and
 * claiming them here is what made Vietnamese pages fetch this file.
 */
export const LATIN_EXT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0100, 0x0101],
  [0x0104, 0x010f],
  [0x0112, 0x0127],
  [0x012a, 0x0130],
  [0x0132, 0x0151],
  [0x0154, 0x0167],
  [0x016a, 0x017f],
  [0x2020, 0x2020],
  [0x20a0, 0x20aa],
  [0x20ad, 0x20c0],
  [0x2113, 0x2113],
];

/** `LATIN_EXT_RANGES` in CSS `unicode-range` syntax. */
export function latinExtUnicodeRange(): string {
  const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");
  return LATIN_EXT_RANGES.map(([lo, hi]) =>
    lo === hi ? `U+${hex(lo)}` : `U+${hex(lo)}-${hex(hi)}`
  ).join(", ");
}

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(appRoot, "package.json"));

export const LATIN_EXT_SOURCE = require.resolve(
  "@fontsource-variable/source-sans-3/files/source-sans-3-latin-ext-wght-normal.woff2"
);

/** Same basename as the Fontsource file, so emitted asset names stay stable. */
export const LATIN_EXT_OUTPUT = join(
  appRoot,
  "src",
  "fonts",
  "generated",
  "source-sans-3-latin-ext-wght-normal.woff2"
);

export async function subsetLatinExt(): Promise<Buffer> {
  let text = "";
  for (const [lo, hi] of LATIN_EXT_RANGES) {
    for (let c = lo; c <= hi; c++) text += String.fromCodePoint(c);
  }
  // Variation axes are kept as-is, so the face still serves weights 200-900.
  return subsetFont(readFileSync(LATIN_EXT_SOURCE), text, {
    targetFormat: "woff2",
  });
}

/** Write the subset atomically; dev and build may call this concurrently. */
export async function writeSubsetFonts(): Promise<void> {
  const out = await subsetLatinExt();
  mkdirSync(dirname(LATIN_EXT_OUTPUT), { recursive: true });
  const tmp = `${LATIN_EXT_OUTPUT}.${process.pid}.tmp`;
  writeFileSync(tmp, out);
  renameSync(tmp, LATIN_EXT_OUTPUT);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeSubsetFonts();
  console.log(LATIN_EXT_OUTPUT);
}
