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
  { name: "default", background: "#f7f7f5", foreground: "#0a0a0a" },
  { name: "card", background: "#ffffff", foreground: "#0a0a0a" },
  { name: "muted", background: "#e5e5e3", foreground: "#0a0a0a" },
  { name: "muted fallback", background: "#e5e5e3", foreground: "#0a0a0a" },
  { name: "cream reader", background: "#faf6ec", foreground: "#2b2620" },
  { name: "gray reader", background: "#dedede", foreground: "#1c1c1a" },
  { name: "gray hover", background: "#e5e5e3", foreground: "#1c1c1a" },
  {
    name: "expanded row",
    background: blend("#e5e5e3", "#f7f7f5", 0.6),
    foreground: "#0a0a0a",
  },
  {
    name: "expanded gray row",
    background: blend("#e5e5e3", "#dedede", 0.6),
    foreground: "#1c1c1a",
  },
];

const DARK_SURFACES: Surface[] = [
  { name: "default", background: "#0c0c0c", foreground: "#fafafa" },
  { name: "card", background: "#171717", foreground: "#fafafa" },
  { name: "muted", background: "#2a2a2a", foreground: "#fafafa" },
  { name: "black reader", background: "#000000", foreground: "#fafafa" },
  {
    name: "expanded row",
    background: blend("#2a2a2a", "#0c0c0c", 0.6),
    foreground: "#fafafa",
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
        { name: "default tint", background: "#f7f7f5", foreground: "#0a0a0a" },
        { name: "cream tint", background: "#faf6ec", foreground: "#2b2620" },
        { name: "gray tint", background: "#dedede", foreground: "#1c1c1a" },
      ];
      const darkBases: Surface[] = [
        { name: "default tint", background: "#0c0c0c", foreground: "#fafafa" },
        { name: "muted tint", background: "#2a2a2a", foreground: "#fafafa" },
        { name: "black tint", background: "#000000", foreground: "#fafafa" },
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
      const lightDot = categoryDotColor(color.light, "#fafafa");
      const darkDot = categoryDotColor(color.dark, "#0a0a0a");
      expect(
        contrastRatio(lightDot, "#0a0a0a"),
        `${String(name)} light selected dot`
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrastRatio(darkDot, "#fafafa"),
        `${String(name)} dark selected dot`
      ).toBeGreaterThanOrEqual(3);
    }

    expect(contrastRatio("#fafafa", "#0a0a0a")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#0a0a0a", "#fafafa")).toBeGreaterThanOrEqual(3);
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
    expect(categoryNavSource).toContain("aria-pressed={isSelected}");
    expect(categoryNavSource).toContain("hover:bg-muted");
    expect(categoryNavSource).toContain("colored={!isSelected}");
    expect(categoryNavSource).toContain("dot={isSelected}");
    expect(storyRowSource).toContain("bg-muted/60");
    expect(storyRowSource).toContain("topic-hl-row");
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
