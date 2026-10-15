// The look registry: every variant the daily video can wear, one entry each, grouped by axis. look.mjs picks the
// ids for a day; build.mjs asks the registry for the chosen entries' markup, CSS, motion and cues. Adding a
// variant is adding one entry to its axis file.
import { BACKGROUNDS } from "./background.mjs";
import { INTROS } from "./intro.mjs";
import { LAYOUTS } from "./layout.mjs";
import { TRANSITIONS } from "./transition.mjs";

/** Day axes: one id per edition, rotated by date over the `auto` entries (look.mjs). */
export const AXES = {
  intro: INTROS,
  transition: TRANSITIONS,
  background: BACKGROUNDS,
};
export { LAYOUTS };

const byId = (list) => Object.fromEntries(list.map((e) => [e.id, e]));
const INDEX = {
  ...Object.fromEntries(
    Object.entries(AXES).map(([axis, list]) => [axis, byId(list)])
  ),
  layout: byId(LAYOUTS),
};

/** The entry for `id` on `axis` ("intro", "transition", "background", "layout"). */
export function entry(axis, id) {
  const e = INDEX[axis]?.[id];
  if (!e) throw new Error(`look registry: no ${axis} "${id}"`);
  return e;
}

/** The chosen entries of a resolved look: one per day axis, plus each layout the day uses. */
function chosen(look) {
  const layouts = [...new Set(Object.values(look.layouts))].sort();
  return {
    day: Object.keys(AXES).map((axis) => entry(axis, look[axis])),
    layouts: layouts.map((id) => entry("layout", id)),
  };
}

/** CSS of the chosen variants, appended after template/style.css. */
export function lookCss(look) {
  const { day, layouts } = chosen(look);
  return [...layouts, ...day]
    .map((e) => e.css ?? "")
    .filter(Boolean)
    .join("");
}

/** `window.__LOOK`: the chosen variants' motion, serialized for template/motion.js. */
export function lookScript(look) {
  const { layouts } = chosen(look);
  const fn = (axis) => entry(axis, look[axis]).motion;
  const layoutFns = layouts
    .filter((e) => e.motion)
    .map((e) => `${JSON.stringify(e.id)}:${e.motion}`)
    .join(",");
  return `window.__LOOK={intro:${fn("intro")},transition:${fn("transition")},layouts:{${layoutFns}}};`;
}
