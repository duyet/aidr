/**
 * @vitest-environment happy-dom
 *
 * Contrast regression for the design tokens in `src/styles.css` (issue #228).
 *
 * Muted text used to be produced with a Tailwind `opacity-*` utility on an
 * already-themed color. Opacity is a compositing step applied *after* color
 * resolution, so it blended the text toward whatever surface was behind it —
 * including the per-user reader background (`data-reader-bg`, see
 * `src/lib/prefs.ts` and `.app-shell` in `src/styles.css`) — producing a pair
 * that no token declared and no test could assert. These tests parse the
 * tokens out of the stylesheet and check the rendered pairs instead:
 *
 *  - every `data-reader-bg` value (parsed from the `ReaderBg` union in
 *    `prefs.ts`) in every theme the app can paint it in, never just the
 *    default background;
 *  - WCAG 2.2 AA for text (4.5:1) and AA large text / non-text UI boundaries
 *    (3:1);
 *  - the visual hierarchy the muted styling exists for: the quiet count stays
 *    quieter than the label it sits next to;
 *  - a deliberately broken fixture, because a contrast test that cannot fail
 *    is not a test.
 *
 * `category-contrast.test.ts` keeps covering the category accent surfaces; this
 * file covers the token layer those mixes are built on.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyReaderTheme, type ReaderBg } from "./prefs";
import { TOPIC_COLOR_PALETTE } from "./topic-color";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../styles.css"), "utf8");
const prefsSource = readFileSync(join(here, "prefs.ts"), "utf8");

/** WCAG 2.2 AA: 4.5:1 body text, 3:1 large text and non-text UI boundaries. */
const AA_TEXT = 4.5;
const AA_LARGE_OR_NON_TEXT = 3;

/* ------------------------------------------------------------------ parsing */

type Tokens = Record<string, string>;

/** Custom properties of a CSS block, keyed without the leading `--`. */
function parseTokens(blockSource: string): Tokens {
  const tokens: Tokens = {};
  for (const match of blockSource.matchAll(
    /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g
  )) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

function blockAt(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0)
    throw new Error(`selector ${selector} missing from styles.css`);
  return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
}

const lightTokens = parseTokens(blockAt(":root {"));
const darkTokens = parseTokens(blockAt(":root.dark,\n.dark {"));

/** The tokens each reader-background swatch pins on the app shell. */
const readerOverrides: Record<string, Tokens> = {};
for (const match of css.matchAll(
  /\.app-shell\[data-reader-bg="([a-z]+)"\]\s*\{([^}]*)\}/g
)) {
  readerOverrides[match[1]] = parseTokens(match[2]);
}

/** The reader-background values the feature actually supports. */
const readerBackgrounds = (
  prefsSource.match(/export type ReaderBg =([^;]+);/)?.[1].match(/"[a-z]+"/g) ??
  []
).map((quoted) => quoted.replaceAll('"', "")) as ReaderBg[];

type Theme = "light" | "dark";

/**
 * Every (theme, reader background) the app can paint, and the surfaces that
 * combination puts behind text.
 *
 * `prefs.ts#applyReaderTheme` applies a swatch together with a theme, and the
 * `default` swatch additionally follows the OS preference because
 * `ThemeProvider` runs next-themes in `system` mode. The crossed pairs (a
 * `cream`/`gray` page under the dark class, a `dark`/`black` page under the
 * light one) are deliberately absent: the swatches repaint the page without
 * repainting the rest of the palette, so a stale `news_prefs.bg` under a
 * system-dark OS leaves *every* token — `--foreground` included — mismatched
 * there. That is a pre-existing gap in the theme system, not something these
 * tokens can fix on their own; see "readers that repaint the page" below for
 * the part of it these tokens do own.
 */
interface Combination {
  theme: Theme;
  background: ReaderBg;
}

const COMBINATIONS: Combination[] = [
  { theme: "light", background: "default" },
  { theme: "light", background: "cream" },
  { theme: "light", background: "gray" },
  { theme: "dark", background: "default" },
  { theme: "dark", background: "dark" },
  { theme: "dark", background: "black" },
];

function themeTokens(theme: Theme, background: ReaderBg): Tokens {
  // Custom properties resolve per element, so a reader background that pins
  // --background/--foreground (and the text steps that belong with that page)
  // wins over the theme block for the app shell subtree.
  return {
    ...(theme === "light" ? lightTokens : darkTokens),
    ...readerOverrides[background],
  };
}

/* ------------------------------------------------------------------- colour */

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function blend(foreground: string, background: string, amount: number): string {
  const [first, second] = [rgb(foreground), rgb(background)];
  return `#${first
    .map((value, index) =>
      Math.round(value * amount + second[index] * (1 - amount))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function relativeLuminance(hex: string): number {
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const [red, green, blue] = rgb(hex);
  return (
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** sRGB `color-mix(in srgb, a pct%, b)`, the form the stylesheet uses. */
function colorMix(a: string, b: string, percent: number): string {
  return blend(a, b, percent / 100);
}

/** Relative luminance gap, i.e. how far a step sits from its surface. */
function separation(color: string, background: string): number {
  return Math.abs(relativeLuminance(color) - relativeLuminance(background));
}

/* ----------------------------------------------------------------- surfaces */

interface Surface {
  name: string;
  background: string;
  /** Foreground the surface resolves, i.e. what an accent mix targets. */
  foreground: string;
}

/**
 * Every surface the quiet tokens can land on: the page itself, the card, the
 * muted chip + story-row surface, and the selected (bg-muted/40) chip wash the
 * trending pills use. The #dedede gray reader background is the worst case in
 * light mode and the #2a2a2a muted surface is the worst case in dark mode —
 * that is what pins the token values.
 */
function surfacesFor(combination: Combination): Surface[] {
  const tokens = themeTokens(combination.theme, combination.background);
  const page = tokens.background;
  const foreground = tokens.foreground;
  const label = `${combination.theme}/${combination.background}`;
  return [
    { name: `${label} page`, background: page, foreground },
    { name: `${label} card`, background: tokens.card, foreground },
    { name: `${label} muted`, background: tokens.muted, foreground },
    {
      name: `${label} selected chip`,
      background: blend(tokens.muted, page, 0.4),
      foreground,
    },
  ];
}

/** Theme the app applies together with a swatch (src/lib/prefs.ts). */
function themeFor(background: ReaderBg): Theme {
  applyReaderTheme(background);
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/* ---------------------------------------------- the assertions under test */

function assertTokenAt(
  tokens: Tokens,
  surface: Surface,
  name: string,
  minimum: number
): void {
  const value = tokens[name];
  expect(value, `token --${name} is not a hex color in styles.css`).toMatch(
    /^#[0-9a-f]{6}$/i
  );
  const ratio = contrastRatio(value, surface.background);
  expect(
    ratio,
    `--${name} ${value} on ${surface.name} ${surface.background} = ${ratio.toFixed(2)}:1, needs ${minimum}:1`
  ).toBeGreaterThanOrEqual(minimum);
}

/** Mix percentage a `.topic-*` class spends on the topic hue. */
function topicMixPercent(className: string): number {
  const match = new RegExp(
    `\\.${className} \\{[^}]*color-mix\\(in srgb, var\\(--tc-\\w+\\) (\\d+)%`
  ).exec(css);
  expect(
    match,
    `.${className} no longer mixes --tc-* with a token`
  ).not.toBeNull();
  return Number(match?.[1]);
}

/** Drops comments so a "why" note may still name the utility it replaced. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const TOPIC_LABEL_PERCENT = topicMixPercent("topic-colored");
const TOPIC_COUNT_PERCENT = topicMixPercent("topic-muted");

/* -------------------------------------------------------------------- tests */

describe("muted text tokens", () => {
  it("enumerates every reader background the prefs feature supports", () => {
    expect(readerBackgrounds).toEqual([
      "default",
      "cream",
      "gray",
      "dark",
      "black",
    ]);
    // Every swatch is checked, and every swatch is checked in the theme
    // applyReaderTheme() paints it in.
    for (const background of readerBackgrounds) {
      const painted = COMBINATIONS.filter(
        (combination) => combination.background === background
      );
      expect(painted.length, `${background} is never checked`).toBeGreaterThan(
        0
      );
      expect(
        painted.some(
          (combination) => combination.theme === themeFor(background)
        ),
        `${background} is not checked in the theme it is applied in`
      ).toBe(true);
    }
  });

  it("declares the quiet step for every theme the app paints", () => {
    for (const theme of ["light", "dark"] as const) {
      const tokens = theme === "light" ? lightTokens : darkTokens;
      expect(tokens["quiet-foreground"], `${theme} --quiet-foreground`).toMatch(
        /^#[0-9a-f]{6}$/i
      );
      expect(
        tokens["primary-foreground-quiet"],
        `${theme} --primary-foreground-quiet`
      ).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // Wired into Tailwind so components can only reach them as text-*.
    expect(css).toContain("--color-quiet-foreground: var(--quiet-foreground)");
    expect(css).toContain(
      "--color-primary-foreground-quiet: var(--primary-foreground-quiet)"
    );
  });

  it("keeps every text step at AA on every reader background in both themes", () => {
    for (const combination of COMBINATIONS) {
      const tokens = themeTokens(combination.theme, combination.background);
      for (const surface of surfacesFor(combination)) {
        for (const step of [
          "foreground",
          "muted-foreground",
          "quiet-foreground",
        ]) {
          assertTokenAt(tokens, surface, step, AA_TEXT);
        }
      }
    }
  });

  it("keeps the quiet step on the inverted primary pill at AA", () => {
    for (const theme of ["light", "dark"] as const) {
      const tokens = theme === "light" ? lightTokens : darkTokens;
      const surface: Surface = {
        name: `${theme} primary pill`,
        background: tokens.primary,
        foreground: tokens["primary-foreground"],
      };
      assertTokenAt(tokens, surface, "primary-foreground-quiet", AA_TEXT);
      assertTokenAt(tokens, surface, "primary-foreground", AA_TEXT);
    }
  });

  it("stays quieter than the step above it (the hierarchy the design needs)", () => {
    for (const combination of COMBINATIONS) {
      const tokens = themeTokens(combination.theme, combination.background);
      const page = surfacesFor(combination)[0];
      // Quiet sits between --muted-foreground and the page it sits on.
      expect(
        separation(tokens["quiet-foreground"], page.background)
      ).toBeLessThan(separation(tokens["muted-foreground"], page.background));
      expect(
        separation(tokens["muted-foreground"], page.background)
      ).toBeLessThan(separation(tokens.foreground, page.background));
    }
  });

  it("gives the topic count a hue-tinted token that is AA and quieter than its label", () => {
    for (const combination of COMBINATIONS) {
      const tokens = themeTokens(combination.theme, combination.background);
      for (const surface of surfacesFor(combination)) {
        for (const color of TOPIC_COLOR_PALETTE) {
          const hue = combination.theme === "light" ? color.light : color.dark;
          const label = colorMix(hue, surface.foreground, TOPIC_LABEL_PERCENT);
          const count = colorMix(
            hue,
            tokens["quiet-foreground"],
            TOPIC_COUNT_PERCENT
          );
          const labelRatio = contrastRatio(label, surface.background);
          const countRatio = contrastRatio(count, surface.background);
          expect(
            labelRatio,
            `topic label ${hue} on ${surface.name}`
          ).toBeGreaterThanOrEqual(AA_TEXT);
          expect(
            countRatio,
            `topic count ${count} on ${surface.name} ${surface.background}`
          ).toBeGreaterThanOrEqual(AA_TEXT);
          // Hierarchy: the count is a secondary detail next to the tag.
          expect(
            countRatio,
            `topic count ${count} is louder than its label ${label} on ${surface.name}`
          ).toBeLessThanOrEqual(labelRatio);
        }
      }
    }
  });

  it("keeps the run-status hover shades at non-text contrast", () => {
    // Declared shades, not an opacity fade: the hover state has to be a color
    // pair the test can see. Each theme moves the bar away from its own
    // surface, so the shades differ per theme.
    const strip = readFileSync(
      join(here, "../components/system/RunStatusStrip.tsx"),
      "utf8"
    );
    const hover: Record<Theme, Record<string, string>> = {
      light: { red: "#b91c1c", emerald: "#047857" }, // tailwind -700
      dark: { red: "#f87171", emerald: "#34d399" }, // tailwind -400
    };
    for (const className of [
      "hover:bg-red-700",
      "dark:hover:bg-red-400",
      "hover:bg-emerald-700",
      "dark:hover:bg-emerald-400",
    ]) {
      expect(strip).toContain(className);
    }
    for (const combination of COMBINATIONS) {
      for (const surface of surfacesFor(combination)) {
        for (const [name, value] of Object.entries(hover[combination.theme])) {
          expect(
            contrastRatio(value, surface.background),
            `${name} hover on ${surface.name}`
          ).toBeGreaterThanOrEqual(AA_LARGE_OR_NON_TEXT);
        }
      }
    }
  });
});

describe("readers that repaint the page", () => {
  it("pins the light text steps on the light reader backgrounds", () => {
    // `.app-shell[data-reader-bg="cream"|"gray"]` repaints the page for a light
    // reader, so the light --muted-foreground/--quiet-foreground have to come
    // with it. Without the pin a system-dark class paints the dark theme's
    // #a3a3a3 on the #faf6ec page (2.3:1) for every muted label on the page.
    for (const background of ["cream", "gray"] as const) {
      expect(
        readerOverrides[background]["quiet-foreground"],
        `${background} must pin --quiet-foreground`
      ).toBe(lightTokens["quiet-foreground"]);
      expect(readerOverrides[background]["muted-foreground"]).toBe(
        lightTokens["muted-foreground"]
      );
    }
    // default/dark inherit the theme; black only moves the page color.
    expect(readerOverrides.default).toBeUndefined();
    expect(readerOverrides.dark).toBeUndefined();
    expect(readerOverrides.black?.background).toBe("#000000");
    expect(readerOverrides.black?.foreground).toBeUndefined();
  });

  it("keeps page-level text AA on a light swatch under the dark class", () => {
    // The part of that state these tokens own: the page is still light, so
    // the pinned light steps have to hold. The rest of the dark palette (the
    // muted/card surfaces) is a pre-existing theme-system mismatch, tracked
    // separately — it fails for --foreground too, so it cannot be asserted
    // here without claiming a fix that is not in this change.
    for (const background of ["cream", "gray"] as const) {
      const tokens = themeTokens("dark", background);
      for (const step of [
        "foreground",
        "muted-foreground",
        "quiet-foreground",
      ]) {
        assertTokenAt(
          tokens,
          {
            name: `dark/${background} page`,
            background: tokens.background,
            foreground: tokens.foreground,
          },
          step,
          AA_TEXT
        );
      }
    }
  });

  it("only reaches the theme the swatch paints it in", () => {
    // applyReaderTheme() is what maps a swatch onto the next-themes class.
    expect(readerBackgrounds.map((b) => [b, themeFor(b)])).toEqual([
      ["default", "light"],
      ["cream", "light"],
      ["gray", "light"],
      ["dark", "dark"],
      ["black", "dark"],
    ]);
  });
});

describe("deliberately broken fixtures (proof the assertions bite)", () => {
  it("rejects a quiet token that only passes on the default background", () => {
    // #6f6f6f is 4.68:1 on the default #f7f7f5 page — a plausible "one step
    // lighter" edit that a default-background-only test waves through — and
    // 3.97:1 on the #dedede gray reader background.
    const broken = {
      ...themeTokens("light", "gray"),
      "quiet-foreground": "#6f6f6f",
    };
    const defaultPage = surfacesFor({
      theme: "light",
      background: "default",
    })[0];
    expect(
      contrastRatio(broken["quiet-foreground"], defaultPage.background)
    ).toBeGreaterThanOrEqual(AA_TEXT);
    const grayPage = surfacesFor({
      theme: "light",
      background: "gray",
    })[0];
    expect(() =>
      assertTokenAt(broken, grayPage, "quiet-foreground", AA_TEXT)
    ).toThrow(/quiet-foreground #6f6f6f on light\/gray page/);
  });

  it("rejects a topic count faded toward the page like the old opacity did", () => {
    // Reproduces the pre-fix composite: the label hue at 70% over the surface
    // is what the old opacity utility used to paint, and it is nowhere near
    // AA on the gray reader background.
    const surface = surfacesFor({
      theme: "light",
      background: "gray",
    })[0];
    const faded = colorMix("#15803d", surface.background, 70);
    expect(contrastRatio(faded, surface.background)).toBeLessThan(AA_TEXT);
    const count = colorMix(
      "#15803d",
      lightTokens["quiet-foreground"],
      TOPIC_COUNT_PERCENT
    );
    expect(contrastRatio(count, surface.background)).toBeGreaterThanOrEqual(
      AA_TEXT
    );
  });

  it("rejects a dark quiet token that only passes on the page, not the muted row", () => {
    const broken = { ...darkTokens, "quiet-foreground": "#7d7d7d" };
    const muted = surfacesFor({
      theme: "dark",
      background: "dark",
    })[2];
    expect(
      contrastRatio(broken["quiet-foreground"], muted.background)
    ).toBeLessThan(AA_TEXT);
    expect(() =>
      assertTokenAt(broken, muted, "quiet-foreground", AA_TEXT)
    ).toThrow(/quiet-foreground/);
  });

  it("rejects a primary pill count that fades further toward the pill", () => {
    // The pill count used to be `opacity-80` on --primary-foreground. 30%
    // instead of 20% still looks like a deliberate fade and drops to 3.9:1.
    const broken: Tokens = {
      ...lightTokens,
      "primary-foreground-quiet": "#6f6f6f",
    };
    const pill: Surface = {
      name: "primary pill",
      background: broken.primary,
      foreground: broken["primary-foreground"],
    };
    expect(
      contrastRatio(broken["primary-foreground-quiet"], pill.background)
    ).toBeLessThan(AA_TEXT);
    expect(() =>
      assertTokenAt(broken, pill, "primary-foreground-quiet", AA_TEXT)
    ).toThrow(/primary-foreground-quiet/);
  });

  it("rejects a reader background that drops the quiet token", () => {
    // Losing the pin in .app-shell[data-reader-bg="gray"] puts the dark
    // theme's --quiet-foreground on a light page under a system-dark class.
    const { "quiet-foreground": _dropped, ...withoutPin } =
      readerOverrides.gray;
    expect(() =>
      assertTokenAt(
        { ...darkTokens, ...withoutPin },
        { name: "gray page", background: "#dedede", foreground: "#1c1c1a" },
        "quiet-foreground",
        AA_TEXT
      )
    ).toThrow(/quiet-foreground/);
  });
});

describe("text colors no longer composite toward the surface", () => {
  const textColorSources = [
    "TrendingChips.tsx",
    "CategoryNav.tsx",
    "system/RunStatusStrip.tsx",
    "dither-kit/legend.tsx",
    "mail/lib.ts",
  ].map((file) => ({
    file,
    source: readFileSync(join(here, "../components", file), "utf8"),
  }));
  const buttonSource = readFileSync(
    join(here, "../../../../packages/ui/ui/button.tsx"),
    "utf8"
  );
  const sources = [
    ...textColorSources.map((entry) => ({
      file: entry.file,
      source: code(entry.source),
    })),
    { file: "ui/button.tsx", source: code(buttonSource) },
  ];

  it("has no opacity-* utility left in a text-color position", () => {
    for (const { file, source } of sources) {
      // Disabled-state opacity is exempt (WCAG 1.4.3 inactive components).
      const offenders = source
        .split("\n")
        .filter((line) => /opacity-\d+/.test(line))
        .filter(
          (line) => !/disabled:opacity-|data-\[disabled\]:opacity-/.test(line)
        );
      expect(offenders, `${file} still dims text with opacity`).toEqual([]);
    }
  });

  it("keeps the state a real token instead of deleting it", () => {
    const [trending, category, , legend] = textColorSources;
    expect(trending.source).toContain("topic-muted");
    expect(category.source).toContain("text-quiet-foreground");
    expect(category.source).toContain("text-primary-foreground-quiet");
    expect(legend.source).toContain("text-quiet-foreground");
    expect(buttonSource).toContain("hover:bg-primary/90");
  });
});
