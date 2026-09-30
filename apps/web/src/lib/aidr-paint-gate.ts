/**
 * Hold the homepage's first paint until the whole AI;DR section is parsed.
 *
 * In the default "brief" layout the AI;DR section sits in a
 * `flex-1 justify-center` column, so it is vertically centred in whatever
 * height it has. If the browser paints while the streamed HTML is only part
 * way through the section, it centres a short, half-parsed card, then moves
 * it up as the rest arrives. Measured on the live page (mobile, 1.6 Mbps,
 * 4x CPU): in 7 of 10 loads the section jumped from y=315–420 to y=203,
 * a 0.08–0.17 layout shift. Whether a paint lands mid-section depends on
 * where the network chunks split, which is why it showed up in only some
 * Lighthouse runs.
 *
 * `<link rel="expect" blocking="render">` tells the browser not to render
 * until the element with this id has been parsed. The marker sits right
 * after the section, so the first paint always has the full card. Browsers
 * without support ignore the link and behave as before.
 */
export const AIDR_END_ID = "aidr-end";

export const AIDR_PAINT_GATE_LINK = {
  rel: "expect",
  href: `#${AIDR_END_ID}`,
  blocking: "render",
} as const;
