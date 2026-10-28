#!/usr/bin/env node
/**
 * Critical-path font budget. Issue #229.
 *
 * The 2026-09-27 Lighthouse run measured four `woff2` requests totalling
 * 143 KiB, all discovered only after the render-blocking stylesheet had been
 * parsed, with a `swap` that produced the measured 0.089 CLS. This check
 * fails if any of that comes back, without needing a browser.
 *
 *   pnpm --filter @aidr/web run check:font-budget
 *   pnpm --filter @aidr/web run build
 *   pnpm --filter @aidr/web run check:font-budget -- --built
 *
 * `--built` reads the emitted CSS and client bundle in dist/client, so it
 * measures what a visitor actually downloads and asserts that the filenames
 * in src/fonts.css still resolve to the assets the build emitted.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const srcDir = join(appRoot, "src");
const distAssets = join(appRoot, "dist", "client", "assets");

/**
 * Bytes the first paint is allowed to need from the body font.
 *
 * Today: Source Sans 3 in one file (latin, the Vietnamese alphabet and Latin
 * Extended-A), 38,136 B. The LCP element is a story row in Source Sans 3.
 * Before the families became one file each, the same coverage took latin
 * (28,740) + vietnamese (10,324) = 39,064 B, plus a 15 KB latin-ext file on
 * any page with a macron.
 */
const CRITICAL_BODY_BUDGET_BYTES = 45_000;

/**
 * Bytes the whole font stack may declare, excluding the opt-in reader serif:
 * Source Sans 3 (38,136) and EB Garamond (54,820, headings like "AI;DR", a
 * date and "Bảng tin theo ngày").
 *
 * The 2026-09-27 baseline transferred 143,488 B over four requests. The
 * budget sits just above today's total so a stray subset cannot come back.
 */
const TOTAL_BUDGET_BYTES = 100_000;

/**
 * Source Serif 4, one file, 62,924 B. Opt-in:
 * only `[data-reader-font="serif"]` uses the family, so only a reader who
 * picked serif downloads it. Budgeted on its own so the default page's
 * total above stays honest.
 */
const READER_SERIF_FAMILY = "Source Serif 4";
const READER_SERIF_BUDGET_BYTES = 70_000;

interface Face {
  family: string;
  display: string;
  url: string;
}

function parseFaces(css: string): Face[] {
  const out: Face[] = [];
  for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const pick = (prop: string) =>
      new RegExp(`${prop}\\s*:\\s*([^;]+);`, "i").exec(body)?.[1]?.trim() ?? "";
    out.push({
      family: pick("font-family").replace(/^["']|["']$/g, ""),
      display: pick("font-display"),
      url: /url\(["']?([^"')]+)["']?\)/.exec(pick("src"))?.[1] ?? "",
    });
  }
  return out;
}

function fail(message: string): never {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

const useBuilt = process.argv.includes("--built");

let cssText: string;
if (useBuilt) {
  const cssFiles = readdirSync(distAssets).filter((f) => f.endsWith(".css"));
  if (cssFiles.length === 0)
    fail(`no CSS in ${distAssets} — run the build first`);
  const index = cssFiles.find((f) => f.startsWith("index-")) ?? cssFiles[0];
  cssText = readFileSync(join(distAssets, index), "utf8");
  console.log(`built CSS: ${index}`);
} else {
  cssText = readFileSync(join(srcDir, "fonts.css"), "utf8");
  console.log("source CSS: src/fonts.css");
}

const faces = parseFaces(cssText).filter((f) => f.url);
const stylesCss = readFileSync(join(srcDir, "styles.css"), "utf8");
const rootTsx = readFileSync(join(srcDir, "routes", "__root.tsx"), "utf8");

console.log(`\nwebfont faces: ${faces.length}`);
for (const face of faces)
  console.log(`  ${face.display.padEnd(8)} ${face.url}`);

// ---- the regression guards -------------------------------------------------

const swapFaces = faces.filter((f) => f.display === "swap");
if (swapFaces.length > 0) {
  fail(
    `${swapFaces.length} face(s) use font-display: swap, which is the ` +
      `measured 0.089 CLS (issue #229)`
  );
}

if (/@import[^;]*fontsource/i.test(stylesCss)) {
  fail(
    "styles.css @imports a Fontsource stylesheet again; the font fetches " +
      "must not wait on the render-blocking stylesheet"
  );
}

const fontPreloads = [...rootTsx.matchAll(/rel: "preload"[^}]*}/g)].filter(
  (m) => m[0].includes('as: "font"')
);
if (fontPreloads.length > 0) {
  fail(
    `${fontPreloads.length} font preload(s) in __root.tsx. With ` +
      `font-display: optional a preload costs 316 ms of LCP render delay ` +
      `and cannot land inside the ~100 ms block period. See ` +
      `FONT_PRELOAD_DECISION in src/lib/fonts.ts`
  );
}

// The metric-matched fallbacks must stay local()-only: they cost zero bytes.
for (const family of ["Source Sans 3", "EB Garamond", READER_SERIF_FAMILY]) {
  if (!stylesCss.includes(`"${family} Fallback"`)) {
    fail(`a font stack in styles.css lost "${family} Fallback"`);
  }
}

// ---- byte budget, from the real build -------------------------------------

if (useBuilt) {
  let total = 0;
  let criticalBody = 0;
  let readerSerif = 0;
  for (const face of faces) {
    const file = face.url.split("/").pop() ?? "";
    if (!existsSafe(join(distAssets, file))) {
      fail(`@font-face references ${face.url} but the build did not emit it`);
    }
    // The fonts are referenced only from the stylesheet, never from JS, so
    // the emitted asset file is the whole contract.
    const bytes = statSync(join(distAssets, file)).size;
    if (face.family.includes(READER_SERIF_FAMILY)) readerSerif += bytes;
    else total += bytes;
    const isFirstPaint = face.family.includes("Source Sans 3");
    if (isFirstPaint) criticalBody += bytes;
    console.log(
      `  ${face.url} -> ${bytes.toLocaleString()} B${
        isFirstPaint ? "  (first paint)" : ""
      }`
    );
  }

  console.log(
    `\nfirst-paint body font: ${criticalBody.toLocaleString()} B ` +
      `(budget ${CRITICAL_BODY_BUDGET_BYTES.toLocaleString()} B)`
  );
  if (criticalBody > CRITICAL_BODY_BUDGET_BYTES) {
    fail(
      `${criticalBody.toLocaleString()} B of body font exceeds the ` +
        `${CRITICAL_BODY_BUDGET_BYTES.toLocaleString()} B first-paint budget`
    );
  }

  console.log(`total declared woff2: ${total.toLocaleString()} B`);
  if (total > TOTAL_BUDGET_BYTES) {
    fail(
      `${total.toLocaleString()} B is over the ` +
        `${TOTAL_BUDGET_BYTES.toLocaleString()} B total budget`
    );
  }
  console.log(`opt-in reader serif woff2: ${readerSerif.toLocaleString()} B`);
  if (readerSerif > READER_SERIF_BUDGET_BYTES) {
    fail(
      `${readerSerif.toLocaleString()} B of reader serif is over the ` +
        `${READER_SERIF_BUDGET_BYTES.toLocaleString()} B opt-in budget`
    );
  }
  console.log("budgets — OK");
} else {
  console.log(
    "\n(pass --built after `pnpm --filter @aidr/web run build` to measure the " +
      "real bytes and confirm the emitted assets exist)"
  );
}

console.log("\nOK");

function existsSafe(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
