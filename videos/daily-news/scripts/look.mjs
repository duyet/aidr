// The video's look, derived from the edition's date at build time and never stored.
// Every axis rotates over its `auto` ids so two adjacent days (or weeks) never share a value, with no
// memory of yesterday: CI never commits, so a look read back from a committed script froze every CI day.
// When two axes are free they rotate together as combinations, so the whole look never ping-pongs either.
// `script.theme` pins an axis: a key it sets wins, and an id outside the axis fails the build.
import { parseWeek } from "./week.mjs";

const AXES = {
  // The grid is the only thumbnail-safe intro (complete on frame 0); the others are pins on request.
  intro: {
    ids: ["grid", "date-slam", "countdown", "headline-stack"],
    auto: ["grid"],
  },
  transition: {
    ids: ["wipe", "ink", "shutter"],
    auto: ["wipe", "ink", "shutter"],
  },
  background: {
    ids: ["paper", "soft", "grid"],
    auto: ["paper", "soft", "grid"],
  },
};
const PIN_ONLY = ["accent"];
// Story layouts are chosen per story from what the story has, not rotated by date. Only `full` needs an image:
// `stat` shows the paper card in its media box when it has none.
const LAYOUTS = {
  split: { image: false, max: Infinity },
  full: { image: true, max: Infinity },
  stat: { image: false, max: 2 },
};
/** A dollar figure ("$40B"): a story whose English bullet names one leads with it. auto-script reads its stat with it. */
export const MONEY = /\$[\d.,]+\s?[KMBT]?\b/;

const DAY = 86400000;
const mod = (a, n) => ((a % n) + n) % n;

/** FNV-1a, 32-bit. Local on purpose: a change to the cast's seeding must not reshuffle looks. */
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

function shuffle(ids, seed) {
  const out = [...ids];
  let x = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const j = (x >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** "YYYY-MM-DD" → days since 1970-01-01; "week-YYYY-Www" → weeks (consecutive weeks are consecutive numbers). */
export function dayNumber(key) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key))
    return Date.parse(`${key}T00:00:00Z`) / DAY;
  const week = /^week-(\d{4}-W\d{2})$/.exec(key ?? "")?.[1];
  if (week)
    return Math.floor(
      Date.parse(`${parseWeek(week).start}T00:00:00Z`) / DAY / 7
    );
  throw new Error(`look key "${key}": expected YYYY-MM-DD or week-YYYY-Www`);
}

/**
 * The id for `day` on one axis. Days run in cycles of n: each cycle is a seeded shuffle of the ids, and when
 * a cycle would open with the id the previous one closed on, its first two swap. So the id changes every day
 * and each id shows once per cycle. Two ids alternate; one id is constant.
 */
export function rotate(list, day, axis) {
  const ids = [...list].sort();
  const n = ids.length;
  if (n < 3) return ids[mod(day + fnv(axis), n)];
  const cycle = (c) => shuffle(ids, fnv(`${axis}:${c}`));
  const c = Math.floor(day / n);
  const p = cycle(c);
  if (p[0] === cycle(c - 1)[n - 1]) [p[0], p[1]] = [p[1], p[0]];
  return p[day - c * n];
}

/**
 * The ids for `day` on two free axes with pools of the same size n >= 3, as one walk over all n*n pairs.
 * a = day mod n and b = day + floor(day / n) mod n, so a window of n*n days shows every pair once. Both ids
 * change every day (b steps by 1 inside a block and by 2 across a block edge) and a is never the same two
 * days apart, so the look never goes A B A B. The sequence has period n*n, which is what a window of n*n
 * distinct days forces; each pool's order is seeded by its axis name.
 */
export function rotatePair(listA, listB, day, axisA, axisB) {
  const n = listA.length;
  if (n < 3 || listB.length !== n)
    throw new Error(
      `rotatePair needs two pools of the same size >= 3, got ${n} and ${listB.length}`
    );
  const [a, b] = [
    shuffle([...listA].sort(), fnv(axisA)),
    shuffle([...listB].sort(), fnv(axisB)),
  ];
  return [a[mod(day, n)], b[mod(day + Math.floor(day / n), n)]];
}

/**
 * { [rank]: layout id } in script order, plus a note for each request it could not honour.
 * Priority: an eligible `story.layout` pin, then the image requirement, then `max`, then no three of one id in a
 * row, then the defaults. `images` must be the files that exist; `money` reads the English bullet only, because
 * visub rewrites the screen text and both cuts must get the same layouts.
 */
function chooseLayouts(stories, edition) {
  const layouts = {};
  const notes = [];
  const history = [];
  for (const [index, story] of stories.entries()) {
    const { rank, layout: pin } = story;
    const images = story.images?.length ?? 0;
    const money = MONEY.test(
      edition.stories?.find((s) => s.rank === rank)?.text ?? ""
    );
    const fits = (id) => images > 0 || !LAYOUTS[id].image;
    let id;
    if (pin !== undefined) {
      if (!LAYOUTS[pin])
        throw new Error(
          `script.stories rank ${rank} layout "${pin}": unknown; use ${Object.keys(LAYOUTS).join(" | ")}`
        );
      if (fits(pin)) id = pin;
    }
    if (!id) {
      const alt = index % 2 ? "full" : "split";
      const other = alt === "full" ? "split" : "full";
      const prefs =
        images === 0
          ? ["split", "stat"]
          : money
            ? ["stat", alt, other]
            : [alt, other];
      const eligible = prefs.filter(
        (p) => fits(p) && history.filter((h) => h === p).length < LAYOUTS[p].max
      );
      id =
        eligible.find((p) => !(history.at(-1) === p && history.at(-2) === p)) ??
        eligible[0];
      if (pin !== undefined)
        notes.push(
          `story ${rank}: layout "${pin}" needs an image; chose ${id}`
        );
    }
    layouts[rank] = id;
    history.push(id);
  }
  return { layouts, notes };
}

/**
 * { intro, transition, background, accent?, layouts, notes } for this edition. Takes no language: build passes
 * script.json for every cut, with each story's images already filtered to the files that exist.
 */
export function resolveLook(script, edition) {
  const pin = script.theme ?? {};
  for (const [axis, id] of Object.entries(pin)) {
    if (PIN_ONLY.includes(axis)) continue;
    if (!AXES[axis])
      throw new Error(
        `script.theme.${axis}: unknown; theme takes ${[...Object.keys(AXES), ...PIN_ONLY].join(", ")}`
      );
    if (!AXES[axis].ids.includes(id))
      throw new Error(
        `script.theme.${axis} "${id}": unknown; use ${AXES[axis].ids.join(" | ")}`
      );
  }
  const day = dayNumber(edition.date);
  const free = Object.keys(AXES).filter(
    (axis) => !(axis in pin) && AXES[axis].auto.length > 1
  );
  const joint =
    free.length === 2
      ? rotatePair(AXES[free[0]].auto, AXES[free[1]].auto, day, ...free)
      : [];
  const look = Object.fromEntries(
    Object.entries(AXES).map(([axis, { auto }]) => [
      axis,
      pin[axis] ??
        (free.length === 2 && free.includes(axis)
          ? joint[free.indexOf(axis)]
          : rotate(auto, day, axis)),
    ])
  );
  return {
    ...look,
    ...(pin.accent ? { accent: pin.accent } : {}),
    ...chooseLayouts(script.stories ?? [], edition),
  };
}
