/**
 * Guards for the self-hosted font stack added in issue #229.
 *
 * Three failure modes this file exists to prevent, all of which are silent:
 *
 *  1. Dropping the `vietnamese` unicode-range. The product is bilingual, and
 *     the whole Latin Extended Additional block (U+1EA0-1EF9) is missing from
 *     the `latin` subset. A latin-only stack renders Vietnamese with a
 *     system font and nobody notices in an English screenshot.
 *  2. A preload href that no longer matches the emitted `@font-face` src
 *     (Vite renames the asset on any content change). The browser then
 *     downloads the font twice and the preload is pure waste.
 *  3. A regression of `font-display` back to `swap`, which is what the
 *     measured 0.089 CLS was.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";
import { describe, expect, it } from "vitest";
import {
  LATIN_EXT_SOURCE,
  latinExtUnicodeRange,
  subsetLatinExt,
} from "../../scripts/subset-fonts";
import { FONT_PRELOAD_DECISION, NON_CRITICAL_FONT_SUBSETS } from "./fonts";

// The font CSS lives in src/, this test in src/lib/.
const srcDir = fileURLToPath(new URL("../", import.meta.url));
const stylesCss = readFileSync(`${srcDir}styles.css`, "utf8");
const fontsCss = readFileSync(`${srcDir}fonts.css`, "utf8");

interface Face {
  family: string;
  display: string;
  weight: string;
  /** The whole `src:` descriptor, including any `local(...)` entries. */
  src: string;
  /** The single `url(...)` target, empty for a local()-only face. */
  url: string;
  unicodeRange: string;
}

function parseFaces(css: string): Face[] {
  const faces: Face[] = [];
  const blocks = css.matchAll(/@font-face\s*\{([^}]*)\}/g);
  for (const [, body] of blocks) {
    const pick = (prop: string) =>
      new RegExp(`${prop}\\s*:\\s*([^;]+);`, "i").exec(body)?.[1]?.trim() ?? "";
    const src = pick("src");
    faces.push({
      family: pick("font-family").replace(/^["']|["']$/g, ""),
      display: pick("font-display"),
      weight: pick("font-weight"),
      src,
      url: /url\(["']?([^"')]+)["']?\)/.exec(src)?.[1] ?? "",
      unicodeRange: pick("unicode-range"),
    });
  }
  return faces;
}

const faces = parseFaces(fontsCss);
/** The faces that actually download a file (the local()-only ones do not). */
const webfaces = faces.filter((f) => f.url);

/** Codepoint ranges a @font-face claims, as inclusive [lo, hi] pairs. */
function ranges(face: Face): [number, number][] {
  return face.unicodeRange
    .split(",")
    .map((part) => part.trim().replace(/^U\+/i, ""))
    .filter(Boolean)
    .map((part) => {
      if (part.includes("-")) {
        const [lo, hi] = part.split("-");
        return [Number.parseInt(lo, 16), Number.parseInt(hi, 16)] as [
          number,
          number,
        ];
      }
      const n = Number.parseInt(part, 16);
      return [n, n] as [number, number];
    });
}

function coveredBy(face: Face, codePoint: number): boolean {
  return ranges(face).some(([lo, hi]) => codePoint >= lo && codePoint <= hi);
}

/**
 * The letters of the Vietnamese alphabet (lower case plus Đ), with the five
 * tone marks and the unmarked form on each of the 12 vowels: 90 characters.
 * Built programmatically so a typo cannot quietly shrink the set.
 */
const VI_BASE_LETTERS = [
  "a",
  "ă",
  "â",
  "b",
  "c",
  "d",
  "đ",
  "e",
  "ê",
  "g",
  "h",
  "i",
  "k",
  "l",
  "m",
  "n",
  "o",
  "ô",
  "ơ",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "ư",
  "v",
  "x",
  "y",
  "Đ",
] as const;

const TONE_MARKS = [
  "",
  "\u0300", // grave
  "\u0301", // acute
  "\u0303", // tilde
  "\u0309", // hook above
  "\u0323", // dot below
] as const;

/** Tone marks only ever sit on vowels in Vietnamese. */
const VI_VOWELS = new Set([
  "a",
  "ă",
  "â",
  "e",
  "ê",
  "i",
  "o",
  "ô",
  "ơ",
  "u",
  "ư",
  "y",
]);

/** Every Vietnamese letter this site can render, as a flat string. */
function vietnameseAlphabet(): string {
  const out: string[] = [];
  for (const base of VI_BASE_LETTERS) {
    // A consonant with a tone mark (ḅ, ḍ, ṭ ...) is not Vietnamese. It was
    // only "covered" before because Fontsource's latin-ext claimed the whole
    // Latin Extended Additional block, which the build-time subset drops.
    for (const tone of VI_VOWELS.has(base) ? TONE_MARKS : [""]) {
      out.push((base + tone).normalize("NFC"));
    }
  }
  return out.join("");
}

describe("self-hosted font stack (#229)", () => {
  it("styles.css does not @import a Fontsource stylesheet", () => {
    // Vite inlines @import at build time, so an @import is not an extra
    // request — but it does mean the browser cannot learn about the woff2
    // files until the render-blocking sheet is parsed. Issue #229 measured
    // that as fonts starting at 1.9 s instead of at HTML-parse time.
    const fontImports = stylesCss
      .split("\n")
      .filter((line) => /@import[^;]*fontsource/i.test(line));
    expect(fontImports).toEqual([]);
  });

  it("styles.css imports the local fonts.css", () => {
    expect(stylesCss).toMatch(/@import\s+"\.\/fonts\.css";/);
  });

  it("declares font-display: optional on every webfont face", () => {
    // `swap` is the measured 0.089 CLS. `block` extends the invisible-text
    // window. `optional` never swaps, so a late font cannot reflow the page.
    expect(webfaces.length).toBeGreaterThan(0);
    for (const face of webfaces) {
      expect(`${face.family} ${face.url}`).toMatch(/./);
      expect(face.display, face.url).toBe("optional");
    }
  });

  it("covers the whole Vietnamese alphabet in the body font", () => {
    const sans = webfaces.filter((f) => f.family.includes("Source Sans 3"));
    expect(sans.length).toBeGreaterThanOrEqual(2);
    const missing = [
      ...new Set([...vietnameseAlphabet()].filter((ch) => ch.trim() === "")),
    ];
    expect(missing).toEqual([]);

    const uncovered = [...new Set([...vietnameseAlphabet()])].filter(
      (ch) => !sans.some((face) => coveredBy(face, ch.codePointAt(0) ?? 0))
    );
    expect(
      uncovered,
      `these Vietnamese characters are not in any Source Sans 3 subset: ${uncovered
        .map(
          (c) => `${c} U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}`
        )
        .join(" ")}`
    ).toEqual([]);
  });

  it("covers the latin-ext macrons that appear in the live feed", () => {
    // Story titles carry polynesian loanwords ("Māori", "Ōtaki"). The trace
    // of the live homepage showed U+0101 and U+014D on both /?lang=en and
    // /?lang=vi, and neither is in the latin or vietnamese subsets — so the
    // latin-ext face is load-bearing and must not be deleted as "unused".
    const loanwords = ["ā", "ē", "ī", "ō", "ū", "Ā", "Ē", "Ī", "Ō", "Ū"];
    const sans = webfaces.filter((f) => f.family.includes("Source Sans 3"));
    const uncovered = loanwords.filter(
      (ch) => !sans.some((face) => coveredBy(face, ch.codePointAt(0) ?? 0))
    );
    expect(uncovered).toEqual([]);
  });

  it("declares a metric-matched fallback face for each webfont family", () => {
    for (const family of ["Source Sans 3 Variable", "EB Garamond Variable"]) {
      const fallback = faces.find(
        (f) => f.family === `${family.split(" Variable")[0]} Fallback`
      );
      expect(fallback, `no fallback face for ${family}`).toBeDefined();
      // local() only: the fallback must cost zero network bytes.
      expect(fallback?.src).toMatch(/local\(/);
      expect(fallback?.url).toBe("");
    }
  });

  it("gives the fallback faces the webfont's own vertical metrics", () => {
    // Read by scripts/font-metrics.py out of the shipped woff2/ttf files:
    //   Source Sans 3  unitsPerEm=1000 ascent=1024 descent=400  lineGap=0
    //   EB Garamond    unitsPerEm=1000 ascent=1007 descent=298  lineGap=0
    const expected: Record<string, [string, string]> = {
      "Source Sans 3 Fallback": ["102.4%", "40%"],
      "EB Garamond Fallback": ["100.7%", "29.8%"],
    };
    for (const [family, [ascent, descent]] of Object.entries(expected)) {
      const block = new RegExp(
        `@font-face\\s*\\{[^}]*font-family:\\s*["']?${family.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}["']?;[^}]*\\}`,
        "s"
      ).exec(fontsCss)?.[0];
      expect(block, `no @font-face block for ${family}`).toBeDefined();
      expect(block).toMatch(/size-adjust:/);
      expect(block).toMatch(
        new RegExp(`ascent-override:\\s*${ascent.replace("%", "\\%")}\\s*;`)
      );
      expect(block).toMatch(
        new RegExp(`descent-override:\\s*${descent.replace("%", "\\%")}\\s*;`)
      );
      expect(block).toMatch(/line-gap-override:\s*0%;/);
    }
  });

  it("puts the metric-matched fallback in each font stack", () => {
    // Declaring the face is not enough: it has to be reachable from the
    // family that renders the LCP row, or the overrides never apply.
    expect(stylesCss).toMatch(
      /--content-font-sans:[^;]*"Source Sans 3 Fallback"/
    );
    expect(stylesCss).toMatch(
      /--editorial-font-serif:[^;]*"EB Garamond Fallback"/
    );
  });

  it("ships the two body subsets the LCP element needs", () => {
    // The LCP element is body text in Source Sans 3, so `latin` (ASCII) and
    // `vietnamese` (every diacritic) are the two that must be present.
    const body = webfaces.filter((f) => f.family.includes("Source Sans 3"));
    const files = body.map((f) => f.url);
    expect(files.some((f) => f.includes("source-sans-3-latin-wght"))).toBe(
      true
    );
    expect(files.some((f) => f.includes("source-sans-3-vietnamese-wght"))).toBe(
      true
    );
    for (const file of files) expect(file).toMatch(/\.woff2$/);
  });

  it("does not preload the fonts", () => {
    // Measured, not assumed. Under `font-display: optional` a face is only
    // used if it arrives inside a ~100 ms block period, which 28 KB cannot
    // do on a 1.6 Mbps link. The preload competes with the render-blocking
    // stylesheet and its bytes are then thrown away: 1,016 ms of LCP element
    // render delay without it, 1,332 ms with it, median of 3, cold.
    // If a preload is ever added back, this test is where the decision gets
    // re-litigated with the numbers in hand.
    const root = readFileSync(`${srcDir}routes/__root.tsx`, "utf8");
    const fontPreloads = [...root.matchAll(/rel: "preload"[^}]*}/g)].filter(
      (m) => m[0].includes('as: "font"')
    );
    expect(fontPreloads).toEqual([]);
    expect(FONT_PRELOAD_DECISION).toContain("316 ms");
  });

  it("still declares every non-preloaded subset as a face", () => {
    // They are not on the critical path, but the text still has to render in
    // the right face once they arrive.
    for (const subset of NON_CRITICAL_FONT_SUBSETS) {
      const face = faces.find((f) => f.url.includes(subset));
      expect(face, `no @font-face for ${subset}`).toBeDefined();
    }
  });

  it("keeps the preconnect list at or under Lighthouse's 4-origin advice", () => {
    const root = readFileSync(`${srcDir}routes/__root.tsx`, "utf8");
    const preconnects = [...root.matchAll(/rel: "preconnect"/g)];
    expect(preconnects.length).toBeGreaterThan(0);
    expect(preconnects.length).toBeLessThanOrEqual(4);
    expect(root).toContain('href: "https://j.duyet.net"');
    expect(root).not.toContain("clarity.ms");
  });
});

describe("build-time latin-ext subset (#229)", () => {
  const latinExt = webfaces.find((f) => f.url.includes("latin-ext"));
  const vietnamese = webfaces.find(
    (f) => f.family.includes("Source Sans 3") && f.url.includes("vietnamese")
  );

  it("points the latin-ext face at the generated subset", () => {
    expect(latinExt?.url).toBe(
      "./fonts/generated/source-sans-3-latin-ext-wght-normal.woff2"
    );
  });

  it("declares exactly the range the subsetter keeps", () => {
    // A code point in the CSS range but not in the file would render as
    // .notdef instead of falling back to the next font in the stack.
    expect(latinExt?.unicodeRange.replace(/\s+/g, " ")).toBe(
      latinExtUnicodeRange()
    );
  });

  it("does not overlap the vietnamese face", () => {
    // The old Fontsource range claimed ă đ ơ ư too, which made every
    // Vietnamese page download the whole 60 KB latin-ext file.
    if (!latinExt || !vietnamese) throw new Error("missing face");
    const overlap = ranges(vietnamese).flatMap(([lo, hi]) => {
      const hits: string[] = [];
      for (let c = lo; c <= hi; c++) {
        if (coveredBy(latinExt, c)) hits.push(`U+${c.toString(16)}`);
      }
      return hits;
    });
    expect(overlap).toEqual([]);
  });

  it("keeps the characters the live feed uses (ā ō ₹)", () => {
    if (!latinExt) throw new Error("missing face");
    for (const ch of ["ā", "ō", "Ā", "Ō", "₹"]) {
      expect(coveredBy(latinExt, ch.codePointAt(0) ?? 0), ch).toBe(true);
    }
  });

  it("produces a small woff2 that is still a variable font", async () => {
    const woff2 = await subsetLatinExt();
    // "wOF2" signature.
    expect([...woff2.subarray(0, 4)]).toEqual([0x77, 0x4f, 0x46, 0x32]);
    // Fontsource's file is 60,088 B; the point of this is to stay far below.
    expect(woff2.length).toBeLessThan(20_000);
    const sfnt = await subsetFont(readFileSync(LATIN_EXT_SOURCE), "ā", {
      targetFormat: "truetype",
    });
    // The wght axis (200-900) must survive, or every weight renders as one.
    // fvar declares the axis; gvar holds the per-glyph weight deltas.
    expect(sfnt.includes(Buffer.from("fvar"))).toBe(true);
    expect(sfnt.includes(Buffer.from("gvar"))).toBe(true);
  });
});
