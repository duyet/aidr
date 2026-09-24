import { describe, expect, it } from "vitest";
import {
  CATEGORY_NAMES,
  categoryColor,
  isKnownCategory,
  NEUTRAL_CATEGORY_COLOR,
  TOPIC_COLOR_PALETTE,
  topicColor,
} from "./topic-color";

describe("topicColor", () => {
  it("is deterministic: same tag always returns the same colors", () => {
    expect(topicColor("GPT-5")).toEqual(topicColor("GPT-5"));
    expect(topicColor("anthropic")).toEqual(topicColor("anthropic"));
  });

  it("returns the same color across repeated calls (no hidden state)", () => {
    const first = topicColor("open-source");
    for (let i = 0; i < 10; i++) {
      expect(topicColor("open-source")).toEqual(first);
    }
  });

  it("normalizes case: differently-cased tags map to the same color", () => {
    expect(topicColor(" GPT-5 ")).toEqual(topicColor("gpt-5"));
    expect(topicColor("Anthropic")).toEqual(topicColor("anthropic"));
    expect(topicColor("ANTHROPIC")).toEqual(topicColor("anthropic"));
  });

  it("normalizes surrounding whitespace", () => {
    expect(topicColor("  llm  ")).toEqual(topicColor("llm"));
  });

  it("always returns a light/dark pair drawn from the defined palette", () => {
    const sampleTags = [
      "gpt-5",
      "anthropic",
      "openai",
      "open-source",
      "llm",
      "robotics",
      "agents",
      "reasoning",
      "safety",
      "chips",
      "funding",
      "startups",
      "google",
      "meta",
      "research",
    ];
    for (const tag of sampleTags) {
      const color = topicColor(tag);
      const match = TOPIC_COLOR_PALETTE.find(
        (p) => p.light === color.light && p.dark === color.dark
      );
      expect(match).toBeDefined();
      expect(color).toBe(match);
    }
  });

  it("pairs light and dark values from the same palette slot", () => {
    for (const slot of TOPIC_COLOR_PALETTE) {
      expect(typeof slot.light).toBe("string");
      expect(typeof slot.dark).toBe("string");
      expect(slot.light).toMatch(/^#[0-9a-f]{6}$/);
      expect(slot.dark).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("distinct tags can map to different colors (palette is actually used)", () => {
    const tags = [
      "gpt-5",
      "anthropic",
      "openai",
      "open-source",
      "llm",
      "robotics",
      "agents",
      "reasoning",
      "safety",
      "chips",
      "funding",
      "startups",
    ];
    const distinctColors = new Set(tags.map((t) => topicColor(t).light));
    expect(distinctColors.size).toBeGreaterThan(1);
  });
});

function channel(value: string): number {
  const srgb = parseInt(value, 16) / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const red = channel(value.slice(0, 2));
  const green = channel(value.slice(2, 4));
  const blue = channel(value.slice(4, 6));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("categoryColor", () => {
  it("maps every canonical category to a stable distinct palette slot", () => {
    const colors = CATEGORY_NAMES.map(categoryColor);
    expect(
      new Set(colors.map((color) => `${color.light}/${color.dark}`)).size
    ).toBe(CATEGORY_NAMES.length);

    for (const name of CATEGORY_NAMES) {
      const color = categoryColor(name);
      expect(color).not.toEqual(NEUTRAL_CATEGORY_COLOR);
      expect(TOPIC_COLOR_PALETTE).toContainEqual(color);
      expect(categoryColor(`  ${name.toLowerCase()}  `)).toEqual(
        categoryColor(name)
      );
    }
  });

  it("uses a neutral accessible fallback for unknown or missing categories", () => {
    for (const name of [
      "",
      "  ",
      "uncategorized",
      "toString",
      null,
      undefined,
    ]) {
      expect(categoryColor(name)).toEqual(NEUTRAL_CATEGORY_COLOR);
    }
  });

  it("recognizes only the canonical category names", () => {
    expect(isKnownCategory("Research")).toBe(true);
    expect(isKnownCategory(" research ")).toBe(true);
    expect(isKnownCategory("uncategorized")).toBe(false);
    expect(isKnownCategory("toString")).toBe(false);
    expect(isKnownCategory(null)).toBe(false);
  });

  it("keeps every category pair at WCAG AA contrast in both themes", () => {
    for (const name of CATEGORY_NAMES) {
      const color = categoryColor(name);
      expect(contrastRatio(color.light, "#f7f7f5")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(color.dark, "#0c0c0c")).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      contrastRatio(NEUTRAL_CATEGORY_COLOR.light, "#f7f7f5")
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(NEUTRAL_CATEGORY_COLOR.dark, "#0c0c0c")
    ).toBeGreaterThanOrEqual(4.5);
  });
});
