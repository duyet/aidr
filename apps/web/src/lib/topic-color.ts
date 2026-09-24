/**
 * Deterministic per-topic and story-category text colors.
 *
 * Tags hash onto a fixed slot in a curated 12-hue palette. Story categories
 * use explicit slots from that same palette so their accents stay stable and
 * meaningful. Unlike a chart-mark palette (vivid fills validated for series
 * identity on a chart surface), these are TEXT colors: dark/muted shades for
 * light mode, light/bright shades for dark mode, each chosen to clear WCAG AA
 * text contrast (>= 4.5:1) against this app's current editorial backgrounds
 * (#f7f7f5 light / #0c0c0c dark). Pure and dependency-free — the same input
 * always maps to the same pair.
 */
export interface TopicColor {
  light: string;
  dark: string;
}

// 12 distinguishable hue families, one text-color pair each. Order is
// arbitrary (colors are chosen by hash, not by index meaning), but kept
// fixed so hashes stay stable across releases.
export const TOPIC_COLOR_PALETTE: readonly TopicColor[] = [
  { light: "#b91c1c", dark: "#f87171" }, // red
  { light: "#c2410c", dark: "#fb923c" }, // orange
  { light: "#92400e", dark: "#fbbf24" }, // amber
  { light: "#15803d", dark: "#4ade80" }, // green
  { light: "#0f766e", dark: "#2dd4bf" }, // teal
  { light: "#0e7490", dark: "#22d3ee" }, // cyan
  { light: "#1d4ed8", dark: "#60a5fa" }, // blue
  { light: "#4338ca", dark: "#818cf8" }, // indigo
  { light: "#6d28d9", dark: "#a78bfa" }, // violet
  { light: "#7e22ce", dark: "#c084fc" }, // purple
  { light: "#be185d", dark: "#f472b6" }, // pink
  { light: "#be123c", dark: "#fb7185" }, // rose
] as const;

/** Canonical story categories emitted by the scoring pipeline. */
export const CATEGORY_NAMES = [
  "Models",
  "Regulation",
  "Products",
  "Agents",
  "Research",
  "Industry",
  "Legal",
  "Infra",
  "Releases",
  "Chips",
  "Funding",
] as const;

/** Stable semantic slots drawn from TOPIC_COLOR_PALETTE, not a second palette. */
const CATEGORY_COLOR_BY_NAME = new Map<string, TopicColor>([
  ["models", TOPIC_COLOR_PALETTE[6]], // blue
  ["regulation", TOPIC_COLOR_PALETTE[0]], // red
  ["products", TOPIC_COLOR_PALETTE[5]], // cyan
  ["agents", TOPIC_COLOR_PALETTE[7]], // indigo
  ["research", TOPIC_COLOR_PALETTE[8]], // violet
  ["industry", TOPIC_COLOR_PALETTE[1]], // orange
  ["legal", TOPIC_COLOR_PALETTE[11]], // rose
  ["infra", TOPIC_COLOR_PALETTE[4]], // teal
  ["releases", TOPIC_COLOR_PALETTE[3]], // green
  ["chips", TOPIC_COLOR_PALETTE[2]], // amber
  ["funding", TOPIC_COLOR_PALETTE[9]], // purple
]);

/** Unknown or missing categories stay neutral instead of inventing a hue.
 * These mirror the current --muted-foreground tokens in both themes. */
export const NEUTRAL_CATEGORY_COLOR: TopicColor = {
  light: "#474747",
  dark: "#a3a3a3",
};

/** Whether a raw category is in the canonical scoring taxonomy. */
export function isKnownCategory(category: string | null | undefined): boolean {
  const canonical = category?.trim().toLowerCase();
  return Boolean(canonical && CATEGORY_COLOR_BY_NAME.has(canonical));
}

/** Simple deterministic string hash (djb2-style), stable across runs. */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33 + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // unsigned
}

/**
 * Maps a topic/tag string to a deterministic { light, dark } text-color
 * pair. Canonicalizes (trim + lowercase) before hashing so "GPT-5",
 * "gpt-5", and " gpt-5 " all land on the same color.
 */
export function topicColor(tag: string): TopicColor {
  const canonical = tag.trim().toLowerCase();
  const index = hashString(canonical) % TOPIC_COLOR_PALETTE.length;
  return TOPIC_COLOR_PALETTE[index];
}

/**
 * Maps a story category to a stable text-color pair. Known categories use
 * the existing topic palette; missing or unrecognized values deliberately
 * fall back to the neutral muted pair rather than implying a new category.
 */
export function categoryColor(category: string | null | undefined): TopicColor {
  const canonical = category?.trim().toLowerCase();
  return (
    (canonical ? CATEGORY_COLOR_BY_NAME.get(canonical) : undefined) ??
    NEUTRAL_CATEGORY_COLOR
  );
}
