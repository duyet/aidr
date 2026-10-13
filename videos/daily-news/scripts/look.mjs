// The video's look, derived from the edition's date at build time and never stored.
// Every axis rotates over its `auto` ids so two adjacent days (or weeks) never share a value, with no
// memory of yesterday: CI never commits, so a look read back from a committed script froze every CI day.
// `script.theme` pins an axis: a key it sets wins, and an id outside the axis fails the build.
import { parseWeek } from "./week.mjs";

const AXES = {
  // The grid is the only thumbnail-safe intro (complete on frame 0); the others are pins on request.
  intro: { ids: ["grid", "date-slam", "countdown", "headline-stack"], auto: ["grid"] },
  transition: { ids: ["wipe", "ink", "shutter"], auto: ["wipe", "ink", "shutter"] },
  background: { ids: ["paper", "soft", "grid"], auto: ["paper", "soft", "grid"] },
};
const PIN_ONLY = ["accent"];

const DAY = 86400000;
const mod = (a, n) => ((a % n) + n) % n;

/** FNV-1a, 32-bit. Local on purpose: a change to the cast's seeding must not reshuffle looks. */
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return Date.parse(`${key}T00:00:00Z`) / DAY;
  const week = /^week-(\d{4}-W\d{2})$/.exec(key ?? "")?.[1];
  if (week) return Math.floor(Date.parse(`${parseWeek(week).start}T00:00:00Z`) / DAY / 7);
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

/** { intro, transition, background, accent? } for this edition. Takes no language: every cut of a day looks the same. */
export function resolveLook(script, edition) {
  const pin = script.theme ?? {};
  for (const [axis, id] of Object.entries(pin)) {
    if (PIN_ONLY.includes(axis)) continue;
    if (!AXES[axis]) throw new Error(`script.theme.${axis}: unknown; theme takes ${[...Object.keys(AXES), ...PIN_ONLY].join(", ")}`);
    if (!AXES[axis].ids.includes(id)) throw new Error(`script.theme.${axis} "${id}": unknown; use ${AXES[axis].ids.join(" | ")}`);
  }
  const day = dayNumber(edition.date);
  const look = Object.fromEntries(Object.entries(AXES).map(([axis, { auto }]) => [axis, pin[axis] ?? rotate(auto, day, axis)]));
  return pin.accent ? { ...look, accent: pin.accent } : look;
}
