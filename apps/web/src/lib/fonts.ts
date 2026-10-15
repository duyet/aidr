/**
 * The font-loading decisions for this app, in one place, with the numbers
 * that justify them. Nothing here is imported by the app: the decisions are
 * enforced by `apps/web/scripts/check-font-budget.ts` (byte budget, no
 * `swap`, no preload, assets actually emitted) and by
 * `apps/web/src/lib/fonts.test.ts` (Vietnamese coverage, metric overrides).
 *
 * Keeping them as a reviewable constant rather than a comment in a CSS file
 * means a reviewer who asks "why is there no font preload?" gets the
 * measurement instead of a link to another discussion.
 */

/**
 * Why there is deliberately no `<link rel="preload" as="font">`.
 *
 * Issue #229 asked for `font-display: optional` **plus** preload. The
 * measurement says the preload is a net loss. `optional` only uses a face
 * that arrives inside a ~100 ms block period; 28 KB cannot cross a 1.6 Mbps
 * link in 100 ms, so a preloaded face is fetched, competes with the
 * render-blocking stylesheet for the same pipe, and is then discarded.
 *
 * Cold mobile load (real CDP throttling, 1.6 Mbps / 150 ms RTT / 4x CPU,
 * cache disabled), LCP element render delay after TTFB, median of 3:
 *
 *   font-display: swap,    4 faces, no preload      1,720 ms   (CLS 0.089)
 *   font-display: optional, 5 faces, no preload      1,016 ms   (CLS 0)
 *   font-display: optional, 5 faces, preload 10 KB   1,100 ms
 *   font-display: optional, 5 faces, preload 38 KB   1,332 ms
 *
 * 316 ms of regression for bytes that get thrown away. A warm cache still
 * paints the webfont on the first frame, because the file is already in the
 * HTTP cache and costs nothing to reach.
 */
export const FONT_PRELOAD_DECISION =
  "no font preload: under font-display: optional it costs 316 ms of LCP element render delay (1,016 -> 1,332 ms, median of 3, cold mobile) and cannot land inside the ~100 ms block period" as const;

/**
 * Subsets that are not needed for the first paint. They are still declared
 * as faces so their text renders correctly once they arrive, but they load
 * on demand at normal priority instead of competing with the stylesheet.
 *
 *   eb-garamond-latin     44,336 B  headings only ("AI;DR", a date)
 *   source-sans-3-latin-ext ~15 KB    only for loanword macrons (ā, ō) and
 *                                     ₹; subset at build time from 60,088 B
 *                                     by scripts/subset-fonts.ts
 *
 * `source-sans-3-latin` (28,740 B) and `source-sans-3-vietnamese` (10,324 B)
 * are the two the first paint needs, and the Vietnamese one is
 * non-negotiable: the whole Latin Extended Additional block is missing from
 * the `latin` subset.
 */
export const NON_CRITICAL_FONT_SUBSETS = [
  "eb-garamond-latin",
  "eb-garamond-vietnamese",
  "source-sans-3-latin-ext",
] as const;

/**
 * How wide Source Sans 3 sets real feed copy, as a share of the same copy in
 * Arial (measured with Liberation Sans, which has Arial's advance widths).
 * Under `font-display: optional` a first visit keeps the fallback for the
 * whole page view, so this is what a new reader sees.
 *
 * Chromium, 63 live titles and AI;DR bullets from 2026-10-16, weight 400,
 * total run width, webfont / fallback:
 *
 *   at 100 px (unhinted, as on macOS and iOS)   EN 0.925   VI 0.915
 *   at 16 px (hinted, Linux)                     EN 0.940   VI 0.926
 *
 * At size-adjust 100% the fallback set rows 6-9% wider than the webfont,
 * so cold rows wrapped and truncated earlier and looked a size larger. The
 * `Source Sans 3 Fallback` face scales Arial by a value inside this band.
 */
export const SANS_FALLBACK_WIDTH_RATIO = { min: 0.915, max: 0.94 } as const;
