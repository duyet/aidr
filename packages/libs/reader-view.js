/*
 * Reader view constants shared by the web app and the Chrome extension.
 * Plain ES module with no imports: the extension has no bundler and loads a
 * byte-identical copy at apps/extension/js/shared/reader-view.js
 * (`pnpm --filter @aidr/libs sync-extension`; reader-view.test.mjs fails on
 * drift). Types live in reader-view.d.ts.
 */

/** Theme a reader gets before choosing one. */
export const DEFAULT_THEME = "light";

/** The AI;DR card: the day-card image, or the text list clamped to 2 or 3
 *  lines a title. */
export const TLDR_VIEWS = ["image", "rows2", "rows3"];

export const DEFAULT_TLDR_VIEW = "rows2";

/** Saved values from before the rows views: the extension stored "text". */
export function normalizeTldrView(value) {
  if (TLDR_VIEWS.includes(value)) return value;
  return DEFAULT_TLDR_VIEW;
}

/** Title line clamp for a view; the image view keeps the 2-row list behind it. */
export function tldrRows(view) {
  return view === "rows3" ? 3 : 2;
}

/** Lucide icon bodies (24x24 viewBox, stroke 2, round caps) for the switch. */
export const TLDR_VIEW_ICONS = {
  image: [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2" }],
    ["circle", { cx: "9", cy: "9", r: "2" }],
    ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" }],
  ],
  // lucide Equal
  rows2: [
    ["path", { d: "M5 9h14" }],
    ["path", { d: "M5 15h14" }],
  ],
  // lucide Menu
  rows3: [
    ["path", { d: "M4 5h16" }],
    ["path", { d: "M4 12h16" }],
    ["path", { d: "M4 19h16" }],
  ],
};
