/**
 * Build-time web font subsets: one file per family.
 *
 * Fontsource ships each family as separate `latin`, `vietnamese` and
 * `latin-ext` files, each its own @font-face. Under `font-display: optional`
 * the browser decides per face whether it arrived inside the ~100 ms block
 * period. When `latin` made it and `vietnamese` did not, a word like "đầu"
 * painted d and u in Source Sans 3 and đ, ầ in Arial for the whole page view.
 * A returning reader whose cache held only the latin file (an English page
 * first, then /?lang=vi) hit this on every first Vietnamese view.
 *
 * One file per family makes `optional` all-or-nothing: a page renders a
 * family entirely in the webfont or entirely in its metric-matched fallback.
 * The files are cut from the full upstream fonts vendored in
 * src/fonts/source (see the README there), because two variable subsets
 * cannot be merged back together (fontTools.merge fails on the shared
 * variation store).
 *
 * The output is generated on every dev/build start (the `subset-fonts`
 * plugin in vite.config.ts) and is gitignored.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

type Range = readonly [number, number];

/** Google Fonts' `latin` subset, the same range Fontsource used. */
const LATIN: readonly Range[] = [
  [0x0000, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x0304, 0x0304],
  [0x0308, 0x0308],
  [0x0329, 0x0329],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

/** Google Fonts' `vietnamese` subset. */
const VIETNAMESE: readonly Range[] = [
  [0x0102, 0x0103],
  [0x0110, 0x0111],
  [0x0128, 0x0129],
  [0x0168, 0x0169],
  [0x01a0, 0x01a1],
  [0x01af, 0x01b0],
  [0x0300, 0x0301],
  [0x0303, 0x0304],
  [0x0308, 0x0309],
  [0x0323, 0x0323],
  [0x0329, 0x0329],
  [0x1ea0, 0x1ef9],
  [0x20ab, 0x20ab],
];

/**
 * The part of Google's `latin-ext` the live feed needs: Latin Extended-A
 * (European names such as Łukasz and Jiří, the loanword macrons ā and ō) and
 * the rupee sign. Scanning /?lang=vi, /?lang=en and /api/feed?days=14 found
 * no other code point from the rest of the 1,000-character block. The rest
 * of the currency block would add 2.3 KB to every reader for signs the feed
 * never printed.
 */
const LATIN_EXT: readonly Range[] = [
  [0x0100, 0x017f],
  [0x20b9, 0x20b9],
];

/** ← and →: the story page's back link prints ←, which `latin` leaves out. */
const ARROWS: readonly Range[] = [[0x2190, 0x2193]];

/** Sorted, merged union of every range each face keeps. */
export const FONT_RANGES: readonly Range[] = (() => {
  const sorted = [...LATIN, ...VIETNAMESE, ...LATIN_EXT, ...ARROWS].toSorted(
    (a, b) => a[0] - b[0]
  );
  const out: [number, number][] = [];
  for (const [lo, hi] of sorted) {
    const last = out.at(-1);
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out;
})();

/** `FONT_RANGES` in CSS `unicode-range` syntax. */
export function fontUnicodeRange(): string {
  const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");
  return FONT_RANGES.map(([lo, hi]) =>
    lo === hi ? `U+${hex(lo)}` : `U+${hex(lo)}-${hex(hi)}`
  ).join(", ");
}

/**
 * OpenType features kept: the union of what Fontsource's latin and
 * vietnamese files carried. ccmp, mark and mkmk stack the Vietnamese tone
 * marks; tnum backs `font-variant-numeric: tabular-nums`. Keeping every
 * feature instead adds stylistic sets and small caps and doubles the file.
 */
const LAYOUT_FEATURES = [
  "ccmp",
  "dnom",
  "frac",
  "kern",
  "liga",
  "locl",
  "mark",
  "mkmk",
  "numr",
  "pnum",
  "rlig",
  "tnum",
];

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fontsDir = join(appRoot, "src", "fonts");

export interface WebFont {
  family: string;
  /** Vendored upstream file in src/fonts/source. */
  source: string;
  /** Output basename in src/fonts/generated, referenced by src/fonts.css. */
  output: string;
  /** Axes pinned to one value; the wght axis always stays variable. */
  pin?: Record<string, number>;
}

export const WEB_FONTS: readonly WebFont[] = [
  {
    family: "Source Sans 3 Variable",
    source: "source-sans-3-wght.woff2",
    output: "source-sans-3-wght-normal.woff2",
  },
  {
    family: "EB Garamond Variable",
    source: "eb-garamond-wght.woff2",
    output: "eb-garamond-wght-normal.woff2",
  },
  {
    family: "Source Serif 4 Variable",
    source: "source-serif-4-opsz-wght.woff2",
    output: "source-serif-4-wght-normal.woff2",
    // The optical size Fontsource's wght-only files were instanced at
    // (glyph advances match exactly), so text sets as it did before.
    pin: { opsz: 14 },
  },
];

export const sourcePath = (font: WebFont) =>
  join(fontsDir, "source", font.source);
export const outputPath = (font: WebFont) =>
  join(fontsDir, "generated", font.output);

export function fontText(): string {
  let text = "";
  for (const [lo, hi] of FONT_RANGES) {
    for (let c = lo; c <= hi; c++) text += String.fromCodePoint(c);
  }
  return text;
}

export function subsetWebFont(
  font: WebFont,
  targetFormat: "woff2" | "truetype" = "woff2"
): Promise<Buffer> {
  return subsetFont(readFileSync(sourcePath(font)), fontText(), {
    targetFormat,
    noHinting: true,
    keepFeatures: LAYOUT_FEATURES,
    ...(font.pin ? { variationAxes: font.pin } : {}),
  });
}

/** Write each subset atomically; dev and build may call this concurrently. */
export async function writeSubsetFonts(): Promise<void> {
  for (const font of WEB_FONTS) {
    const out = await subsetWebFont(font);
    const path = outputPath(font);
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, out);
    renameSync(tmp, path);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeSubsetFonts();
  for (const font of WEB_FONTS) {
    const bytes = readFileSync(outputPath(font)).length;
    console.log(`${outputPath(font)} ${bytes.toLocaleString()} B`);
  }
}
