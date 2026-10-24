/**
 * Port of apps/web/src/lib/topic-color.ts — keep the palette and djb2
 * hash identical so extension chips/highlights match aidr.today.
 */

export const TOPIC_COLOR_PALETTE = [
  { light: "#b91c1c", dark: "#f87171" },
  { light: "#c2410c", dark: "#fb923c" },
  { light: "#92400e", dark: "#fbbf24" },
  { light: "#15803d", dark: "#4ade80" },
  { light: "#0f766e", dark: "#2dd4bf" },
  { light: "#0e7490", dark: "#22d3ee" },
  { light: "#1d4ed8", dark: "#60a5fa" },
  { light: "#4338ca", dark: "#818cf8" },
  { light: "#6d28d9", dark: "#a78bfa" },
  { light: "#7e22ce", dark: "#c084fc" },
  { light: "#be185d", dark: "#f472b6" },
  { light: "#be123c", dark: "#fb7185" },
];

function hashString(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33 + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function topicColor(tag) {
  const canonical = String(tag ?? "")
    .trim()
    .toLowerCase();
  const index = hashString(canonical) % TOPIC_COLOR_PALETTE.length;
  return TOPIC_COLOR_PALETTE[index];
}

/** Stable semantic slots drawn from TOPIC_COLOR_PALETTE, not a second palette. */
const CATEGORY_COLOR_BY_NAME = new Map([
  ["models", TOPIC_COLOR_PALETTE[6]],
  ["regulation", TOPIC_COLOR_PALETTE[0]],
  ["products", TOPIC_COLOR_PALETTE[5]],
  ["agents", TOPIC_COLOR_PALETTE[7]],
  ["research", TOPIC_COLOR_PALETTE[8]],
  ["industry", TOPIC_COLOR_PALETTE[1]],
  ["legal", TOPIC_COLOR_PALETTE[11]],
  ["infra", TOPIC_COLOR_PALETTE[4]],
  ["releases", TOPIC_COLOR_PALETTE[3]],
  ["chips", TOPIC_COLOR_PALETTE[2]],
  ["funding", TOPIC_COLOR_PALETTE[9]],
  ["tools", TOPIC_COLOR_PALETTE[10]],
  ["frameworks", TOPIC_COLOR_PALETTE[2]],
  ["data", TOPIC_COLOR_PALETTE[5]],
  ["open source", TOPIC_COLOR_PALETTE[3]],
]);

/** Unknown categories stay neutral (the --muted-foreground pair). */
export const NEUTRAL_CATEGORY_COLOR = { light: "#474747", dark: "#a3a3a3" };

export function categoryColor(category) {
  const canonical = String(category ?? "")
    .trim()
    .toLowerCase();
  return CATEGORY_COLOR_BY_NAME.get(canonical) ?? NEUTRAL_CATEGORY_COLOR;
}
