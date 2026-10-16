// node --test videos/daily-news/scripts/*.test.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { dayNumber } from "./look.mjs";
import { AXES, entry, LAYOUTS, lookCss, lookScript } from "./looks/index.mjs";
import { BED, bedStartFor, POOLS, SFX, soundFor } from "./looks/sound.mjs";
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
test("a cut too long for the day's bed start moves back to an earlier phrase instead of running off the bed", () => {
  // A weekly cut over 156 s from the 24 s start, or a daily one over 124 s from 56 s, ran past the bed and failed
  // the build. The clamp lands on a phrase start, so the music still opens on a full bar.
  assert.equal(bedStartFor(56, 130), 48);
  assert.equal(bedStartFor(24, 160), 16);
  assert.equal(bedStartFor(56, 179), 0);
  for (const [start, total] of [
    [56, 130],
    [24, 160],
    [40, 175],
  ]) {
    const at = bedStartFor(start, total);
    assert.ok(at + total <= BED.duration, `${start}+${total} → ${at}`);
    assert.ok(BED.starts.daily.includes(at), `${at} is a phrase start`);
  }
  // With room, the day's rotation stands.
  for (const start of BED.starts.daily)
    assert.equal(bedStartFor(start, 117), start);
});

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

// Frame 0 is the thumbnail on Reels, TikTok and Shorts, so a rotating intro is finished on frame 0 and only moves
// after it. GSAP renders a from()/fromTo() from-state at build time, wherever the tween sits on the timeline, so
// `fromTo(title, { opacity: 0 }, ..., 2)` leaves the title invisible on frame 0. This runs each auto intro's motion
// against a recording timeline and fails on any tween that hides an element on frame 0. A bar or rule may grow from
// nothing (scaleX/scaleY 0): it is the one allowance, and only for elements whose class names a bar or rule.
const ACCENT = /\.[\w-]*(bar|rule)[\w-]*(\[\d+\])?$/;
const closedClip = (v) => {
  const m = /^inset\(([^)]*)\)$/.exec(String(v).trim());
  if (!m) return false;
  const [t, r = t, b = t, l = r] = m[1].split(/\s+/).map(parseFloat);
  return t + b >= 100 || l + r >= 100;
};
function hides(vars, target) {
  const why = [];
  if (vars.opacity === 0 || vars.autoAlpha === 0) why.push("opacity 0");
  if (vars.visibility === "hidden" || vars.display === "none")
    why.push("hidden");
  if (vars.clipPath !== undefined && closedClip(vars.clipPath))
    why.push(`clipPath ${vars.clipPath}`);
  if (vars.width === 0 || vars.height === 0) why.push("zero size");
  if (vars.scale === 0) why.push("scale 0");
  if ((vars.scaleX === 0 || vars.scaleY === 0) && !ACCENT.test(target))
    why.push("scaleX/scaleY 0 on content");
  return why;
}
const stub = (sel, i) => ({
  sel: i === undefined ? sel : `${sel}[${i}]`,
  classList: { contains: () => false },
  offsetWidth: 400,
  offsetHeight: 300,
});
const name = (t) =>
  [t]
    .flat()
    .map((x) => (typeof x === "string" ? x : x?.sel))
    .join(",");
function frameZero(motion, { n, vertical, focus }) {
  const I = { variant: "x", start: 0, dur: 8, focus };
  const blanks = [];
  const tl = {};
  const rec = (kind, target, from, to, at) => {
    const t = name(target);
    const pos = typeof at === "number" ? at : 0;
    const shown = (vars) => hides(vars ?? {}, t);
    let why = [];
    if (kind === "fromTo" && !(to.immediateRender === false && pos > I.start))
      why = shown(from);
    if (kind === "from" && from.immediateRender !== false) why = shown(from);
    if ((kind === "set" || kind === "to") && pos <= I.start && !to.duration)
      why = shown(to);
    if (why.length) blanks.push(`${kind}(${t}) at ${pos}: ${why.join(", ")}`);
    return tl;
  };
  tl.fromTo = (t, a, b, at) => rec("fromTo", t, a, b, at);
  tl.from = (t, a, at) => rec("from", t, a, {}, at);
  tl.to = (t, b, at) => rec("to", t, {}, b, at);
  tl.set = (t, b, at) => rec("set", t, {}, b, at);
  const h = {
    $: (s, root) => stub(root?.sel ? `${root.sel} ${s}` : s),
    $$: (s, root) =>
      Array.from({ length: n }, (_, i) =>
        stub(root?.sel ? `${root.sel} ${s}` : s, i)
      ),
    fit: () => {},
    fitWidth: () => true,
    fitAbove: () => {},
    measured: (_el, fn) => fn(),
    LAND: "expo.out",
    F: 1 / 30,
    vertical,
    IN: 0.32,
    OUT: 0.4,
  };
  motion(tl, I, h);
  return blanks;
}

test("every rotating intro is finished on frame 0 (the platforms' thumbnail)", () => {
  const blank = [];
  for (const e of AXES.intro.filter((x) => x.auto))
    for (const n of [1, 4, 8])
      for (const vertical of [false, true])
        for (const focus of [
          [],
          [
            { rank: 1, at: 2.1 },
            { rank: n, at: 3.4 },
          ],
        ])
          for (const b of frameZero(e.motion, { n, vertical, focus }))
            blank.push(
              `${e.id} (${n} stories, ${vertical ? "9x16" : "16x9"}): ${b}`
            );
  assert.deepEqual([...new Set(blank)], []);
});

test("the frame-0 check catches an intro that fades in from nothing", () => {
  const fadeIn = (tl, I, h) => {
    tl.fromTo(
      ".title",
      { y: 50, opacity: 0 },
      { y: 0, opacity: 1 },
      I.start + 1.2
    );
    tl.fromTo(h.$(".rule"), { scaleX: 0 }, { scaleX: 1 }, I.start + 0.5);
    tl.fromTo(
      ".img",
      { clipPath: "inset(0% 100% 0% 0%)" },
      { clipPath: "inset(0%)" },
      I.start
    );
    tl.to(".late", { opacity: 0, duration: 0.3 }, I.start + 3);
  };
  assert.deepEqual(frameZero(fadeIn, { n: 1, vertical: false, focus: [] }), [
    "fromTo(.title) at 1.2: opacity 0",
    "fromTo(.img) at 0: clipPath inset(0% 100% 0% 0%)",
  ]);
});
