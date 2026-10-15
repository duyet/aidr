// node --test videos/daily-news/scripts/*.test.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { dayNumber } from "./look.mjs";
import { AXES, entry, LAYOUTS, lookCss, lookScript } from "./looks/index.mjs";
import { BED, POOLS, SFX, soundFor } from "./looks/sound.mjs";
import { isoWeekOf } from "./week.mjs";

const ROOT = resolve(import.meta.dirname, "..");

const all = () => [
  ...Object.entries(AXES).flatMap(([axis, list]) => list.map((e) => [axis, e])),
  ...LAYOUTS.map((e) => ["layout", e]),
];

test("every registry axis has unique ids and at least one entry in the rotation", () => {
  for (const [axis, list] of Object.entries(AXES)) {
    const ids = list.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, `${axis}: duplicate id`);
    assert.ok(
      list.some((e) => e.auto),
      `${axis}: nothing rotates`
    );
  }
  const ids = LAYOUTS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "layout: duplicate id");
});

test("every entry has the hooks build.mjs calls for its axis", () => {
  for (const [axis, e] of all()) {
    const at = `${axis} "${e.id}"`;
    assert.equal(typeof (e.css ?? ""), "string", `${at}: css`);
    if (axis === "intro") {
      assert.equal(typeof e.html, "function", `${at}: html`);
      assert.equal(typeof e.cues, "function", `${at}: cues`);
      assert.equal(typeof e.motion, "function", `${at}: motion`);
    }
    if (axis === "transition" || axis === "choreography") {
      if (axis === "transition")
        assert.equal(typeof e.html, "function", `${at}: html`);
      assert.equal(typeof e.motion, "function", `${at}: motion`);
    }
    if (axis === "layout") {
      assert.equal(typeof e.image, "boolean", `${at}: image`);
      assert.ok(e.max >= 1, `${at}: max`);
    }
  }
});

// The page runs `window.__LOOK={intro:<source>,...}`: a method shorthand (`motion(tl) {}`) serializes to source
// that is not an expression, and the whole page script fails, leaving every frame blank.
test("every motion serializes into the page as a function expression", () => {
  for (const [axis, e] of all()) {
    if (!e.motion) continue;
    const fn = new Function(`return (${e.motion});`)();
    assert.equal(typeof fn, "function", `${axis} "${e.id}"`);
  }
});

test("the page script and CSS carry the chosen variants only", () => {
  const look = {
    intro: "grid",
    transition: "shutter",
    background: "soft",
    choreography: "slide",
    layouts: { 1: "full", 2: "split", 3: "full" },
  };
  const src = lookScript(look);
  const window = {};
  new Function("window", src)(window);
  assert.deepEqual(Object.keys(window.__LOOK.layouts), ["full"]);
  assert.equal(typeof window.__LOOK.intro, "function");
  assert.equal(typeof window.__LOOK.transition, "function");
  assert.equal(typeof window.__LOOK.choreography, "function");
  const css = lookCss(look);
  assert.ok(css.includes(".bg-soft .ground"));
  assert.ok(css.includes(".wipe .half"));
  assert.ok(css.includes(".l-full .copy"));
  assert.ok(!css.includes(".ink-panel"), "an unchosen transition's CSS");
  assert.ok(!css.includes(".l-stat"), "an unused layout's CSS");
  assert.throws(() => entry("intro", "nope"), /no intro "nope"/);
});

const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const sfxDir = join(ROOT, config.sfx.dir);
const manifest = JSON.parse(
  readFileSync(join(sfxDir, "manifest.json"), "utf8")
);
const audio = (name) =>
  createHash("sha1")
    .update(readFileSync(join(sfxDir, manifest[name].file)))
    .digest("hex");
const DAY = 86400000;
const days = (from, n) =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.parse(`${from}T00:00:00Z`) + i * DAY)
      .toISOString()
      .slice(0, 10)
  );
const TWO_YEARS = days("2026-01-01", 731);

// A cue with no pool crashes the mix; a file missing from the library or SFX has no file or no peak, so its hit
// lands late by the file's lead-in (or the build dies).
test("every cue the build plays has a pool of measured library files", () => {
  const ctx = { stories: [{}, {}, {}], focus: [{ at: 1 }] };
  const cues = new Set([
    "open",
    "storyIn",
    "rankHit",
    "statHit",
    "outro",
    ...AXES.intro.flatMap((e) => e.cues(ctx).map(([cue]) => cue)),
  ]);
  for (const cue of cues) assert.ok(POOLS[cue], `${cue}: no pool`);
  for (const [cue, pool] of Object.entries(POOLS)) {
    assert.ok(pool.length >= 2, `${cue}: one file never changes`);
    for (const name of pool) {
      assert.ok(manifest[name], `${cue}: "${name}" is not in the library`);
      assert.equal(
        typeof SFX[name]?.peak,
        "number",
        `${cue}: "${name}" has no peak`
      );
      assert.equal(
        typeof SFX[name]?.level,
        "number",
        `${cue}: "${name}" has no level`
      );
    }
  }
});

// whoosh-short is whoosh byte for byte: a pool of the two rotates its name every day and its sound never.
test("no pool holds the same audio twice", () => {
  for (const [cue, pool] of Object.entries(POOLS)) {
    const hashes = pool.map(audio);
    assert.equal(
      new Set(hashes).size,
      pool.length,
      `${cue}: ${pool.join(", ")}`
    );
  }
});

test("each cue plays a different file every day and its whole pool every cycle", () => {
  for (const [cue, pool] of Object.entries(POOLS)) {
    const cycles = new Map();
    TWO_YEARS.forEach((date, i) => {
      const pick = soundFor(date).sfx[cue];
      if (i)
        assert.notEqual(
          pick,
          soundFor(TWO_YEARS[i - 1]).sfx[cue],
          `${cue} on ${date}`
        );
      const c = Math.floor(dayNumber(date) / pool.length);
      cycles.set(c, [...(cycles.get(c) ?? []), pick]);
    });
    for (const [c, picks] of cycles)
      if (picks.length === pool.length)
        assert.deepEqual(
          [...picks].sort(),
          [...pool].sort(),
          `${cue} cycle ${c}`
        );
  }
});

// open and rankHit share the two bass impacts: on a day both drew one, the opener and every rank tile would sound alike.
test("no two cues play the same file on one day", () => {
  for (const date of TWO_YEARS) {
    const picks = Object.values(soundFor(date).sfx);
    assert.equal(
      new Set(picks).size,
      picks.length,
      `${date}: ${picks.join(", ")}`
    );
  }
});

// build.mjs throws when the bed ends before the cut: every daily start must leave room for a Reel (90 s) and for the
// longest committed edition, or that edition stops building on the days that draw the start; weekly for 150 s.
test("the bed start leaves room for the cut and changes every day", () => {
  const longest = Math.max(
    90,
    ...["2026-10-02", "2026-10-03", "2026-10-10", "2026-10-13"].map(
      (d) =>
        JSON.parse(
          readFileSync(join(ROOT, "editions", d, "timeline.json"), "utf8")
        ).total
    )
  );
  for (const start of BED.starts.daily)
    assert.ok(start + longest <= BED.duration, `daily start ${start}`);
  for (const start of BED.starts.weekly)
    assert.ok(start + 150 <= BED.duration, `weekly start ${start}`);
  const weeks = [
    ...new Set(TWO_YEARS.map((date) => `week-${isoWeekOf(date)}`)),
  ];
  for (const keys of [TWO_YEARS, weeks])
    for (let i = 1; i < keys.length; i++)
      assert.notEqual(
        soundFor(keys[i]).bedStart,
        soundFor(keys[i - 1]).bedStart,
        keys[i]
      );
});
