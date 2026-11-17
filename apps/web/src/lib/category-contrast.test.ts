import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CategoryLabel } from "../components/CategoryLabel";
import { CategoryNav } from "../components/CategoryNav";
import {
  CATEGORY_NAMES,
  categoryColor,
  NEUTRAL_CATEGORY_COLOR,
} from "./topic-color";

const CATEGORY_TEXT_ACCENT = 0.7;
const CATEGORY_DOT_ACCENT = 0.6;
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../styles.css"), "utf8");
const categoryNavSource = readFileSync(
  join(here, "../components/CategoryNav.tsx"),
  "utf8"
);
const storyRowSource = readFileSync(
  join(here, "../components/StoryRow.tsx"),
  "utf8"
);

type Surface = {
  name: string;
  background: string;
  foreground: string;
};

const LIGHT_SURFACES: Surface[] = [
  { name: "default", background: "#faf9f5", foreground: "#1f1e1d" },
  { name: "card", background: "#ffffff", foreground: "#1f1e1d" },
  { name: "muted", background: "#f0eee6", foreground: "#1f1e1d" },
  { name: "cream reader", background: "#faf6ec", foreground: "#2b2620" },
  { name: "gray reader", background: "#e4e4df", foreground: "#1f1e1d" },
  { name: "gray hover", background: "#f0eee6", foreground: "#1f1e1d" },
  {
    name: "expanded row",
    background: blend("#f0eee6", "#faf9f5", 0.6),
    foreground: "#1f1e1d",
  },
  {
    name: "expanded gray row",
    background: blend("#f0eee6", "#e4e4df", 0.6),
    foreground: "#1f1e1d",
  },
];

const DARK_SURFACES: Surface[] = [
  { name: "default", background: "#1f1e1d", foreground: "#f5f4ee" },
  { name: "card", background: "#262624", foreground: "#f5f4ee" },
  { name: "muted", background: "#30302e", foreground: "#f5f4ee" },
  { name: "black reader", background: "#000000", foreground: "#f5f4ee" },
  { name: "black muted", background: "#151515", foreground: "#f5f4ee" },
  {
    name: "expanded row",
    background: blend("#30302e", "#1f1e1d", 0.6),
    foreground: "#f5f4ee",
  },
];

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function blend(foreground: string, background: string, amount: number): string {
  const first = rgb(foreground);
  const second = rgb(background);
  return `#${first
    .map((value, index) =>
      Math.round(value * amount + second[index] * (1 - amount))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = rgb(hex);
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function categoryTextColor(accent: string, foreground: string): string {
  return blend(accent, foreground, CATEGORY_TEXT_ACCENT);
}

function categoryDotColor(accent: string, primaryForeground: string): string {
  return blend(accent, primaryForeground, CATEGORY_DOT_ACCENT);
}

function categoryNamesWithUnknown(): (string | null | undefined)[] {
  return [...CATEGORY_NAMES, "uncategorized", null, undefined];
}

describe("category accent surfaces", () => {
  it("keeps category text at AA on light reader and interactive surfaces", () => {
    for (const name of categoryNamesWithUnknown()) {
      const color = categoryColor(name);
      for (const surface of LIGHT_SURFACES) {
        const text = categoryTextColor(color.light, surface.foreground);
        expect(
          contrastRatio(text, surface.background),
          `${String(name)} on ${surface.name}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps category text at AA on dark, muted, and expanded surfaces", () => {
    for (const name of categoryNamesWithUnknown()) {
      const color = categoryColor(name);
      for (const surface of DARK_SURFACES) {
        const text = categoryTextColor(color.dark, surface.foreground);
        expect(
          contrastRatio(text, surface.background),
          `${String(name)} on ${surface.name}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps category text readable on tinted topic rows", () => {
    for (const name of categoryNamesWithUnknown()) {
      const color = categoryColor(name);
      const lightBases: Surface[] = [
        { name: "default tint", background: "#faf9f5", foreground: "#1f1e1d" },
        { name: "cream tint", background: "#faf6ec", foreground: "#2b2620" },
        { name: "gray tint", background: "#e4e4df", foreground: "#1f1e1d" },
      ];
      const darkBases: Surface[] = [
        { name: "default tint", background: "#1f1e1d", foreground: "#f5f4ee" },
        { name: "muted tint", background: "#30302e", foreground: "#f5f4ee" },
        { name: "black tint", background: "#000000", foreground: "#f5f4ee" },
      ];

      for (const base of lightBases) {
        const tinted = blend(color.light, base.background, 0.08);
        const text = categoryTextColor(color.light, base.foreground);
        expect(
          contrastRatio(text, tinted),
          `${String(name)} on ${base.name}`
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const base of darkBases) {
        const tinted = blend(color.dark, base.background, 0.14);
        const text = categoryTextColor(color.dark, base.foreground);
        expect(
          contrastRatio(text, tinted),
          `${String(name)} on ${base.name}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps selected category dots at graphical-object contrast", () => {
    for (const name of categoryNamesWithUnknown()) {
      const color = categoryColor(name);
      const lightDot = categoryDotColor(color.light, "#ffffff");
      const darkDot = categoryDotColor(color.dark, "#1f1e1d");
      expect(
        contrastRatio(lightDot, "#1f1e1d"),
        `${String(name)} light selected dot`
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrastRatio(darkDot, "#f5f4ee"),
        `${String(name)} dark selected dot`
      ).toBeGreaterThanOrEqual(3);
    }

    expect(contrastRatio("#ffffff", "#1f1e1d")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#1f1e1d", "#f5f4ee")).toBeGreaterThanOrEqual(3);
  });

  it("retains a high-contrast fallback when color-mix is unavailable", () => {
    for (const surface of [...LIGHT_SURFACES, ...DARK_SURFACES]) {
      expect(
        contrastRatio(surface.foreground, surface.background)
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(css).toMatch(
      /\.category-colored\s*\{[^}]*color:\s*var\(--foreground\);/
    );
    expect(css).toMatch(
      /\.category-filter-dot\s*\{[^}]*background-color:\s*var\(--primary-foreground\);/
    );
    expect(css).toMatch(
      /\.topic-hl-row\s*\{[^}]*background-color:\s*transparent;/
    );
    expect(css).toContain("@supports (color: color-mix(in srgb, red, blue))");
    expect(css).toContain("var(--tc-light) 70%");
    expect(css).toContain("var(--tc-dark) 70%");
    expect(css).toContain("var(--tc-light) 60%");
    expect(css).toContain("var(--tc-dark) 60%");
  });

  it("keeps forced-colors and interactive state cues in CSS and components", () => {
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("color: CanvasText;");
    expect(css).toContain("background-color: CanvasText;");
    expect(css).toContain("outline: 1px solid Canvas;");
    expect(css).toContain("outline: 1px solid var(--primary-foreground);");
    expect(categoryNavSource).toContain("pressed={isSelected}");
    expect(categoryNavSource).toContain("quiet={!isSelected}");
    expect(categoryNavSource).toContain("dot={isSelected}");
    expect(css).toMatch(/\.chip:hover\s*\{[^}]*var\(--border\)/);
    expect(css).toMatch(
      /\.chip\[aria-pressed="true"\][^{]*\{[^}]*background-color:\s*var\(--primary\);/
    );
    expect(storyRowSource).toContain("bg-muted/60");
    expect(storyRowSource).toContain("topic-hl-row");
  });

  it("renders the category count with a quiet token, never an opacity", () => {
    expect(categoryNavSource).toContain("chip-count");
    expect(css).toMatch(
      /\.chip-count\s*\{[^}]*color:\s*var\(--quiet-foreground\);/
    );
    expect(css).toMatch(
      /\.chip-count\s*\{[^}]*color:\s*var\(--primary-foreground-quiet\);/
    );
    // Comments may still name the utility they replaced; className may not.
    const withoutComments = categoryNavSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(withoutComments).not.toMatch(/opacity-\d+/);
  });

  it("keeps selected-filter state available to assistive technology during SSR", () => {
    const html = renderToStaticMarkup(
      createElement(CategoryNav, {
        categories: [{ name: "Research", count: 2 }],
        selected: new Set(["Research"]),
        onToggle: () => undefined,
        lang: "en",
      })
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("category-filter-dot");
    expect(html).toContain("Research");
  });

  it("renders category labels safely during SSR", () => {
    const html = renderToStaticMarkup(
      createElement(CategoryLabel, {
        name: "Research",
        lang: "en",
        dot: true,
      })
    );
    expect(html).toContain("category-colored");
    expect(html).toContain("category-filter-dot");
    expect(html).toContain("Research");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("--tc-light:");
    expect(html).not.toContain("color-mix");

    const selectedHtml = renderToStaticMarkup(
      createElement(CategoryLabel, {
        name: "Research",
        lang: "en",
        colored: false,
        dot: true,
      })
    );
    expect(selectedHtml).toContain("Research");
    expect(selectedHtml).not.toContain("category-colored");
    expect(selectedHtml).toContain("category-filter-dot");

    const unknownHtml = renderToStaticMarkup(
      createElement(CategoryLabel, { name: "uncategorized", lang: "en" })
    );
    expect(unknownHtml).toContain("uncategorized");
    expect(unknownHtml).toContain(NEUTRAL_CATEGORY_COLOR.light);
  });
});
