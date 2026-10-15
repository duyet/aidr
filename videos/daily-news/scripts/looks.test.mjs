// node --test videos/daily-news/scripts/*.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { AXES, entry, LAYOUTS, lookCss, lookScript } from "./looks/index.mjs";
import { CUES, PEAK } from "./looks/sound.mjs";

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

// A cue whose file has no PEAK entry plays from its first sample, so its hit lands late by the file's lead-in.
test("every sound cue names a file in the effects library with a measured peak", () => {
  const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
  const manifest = JSON.parse(
    readFileSync(join(ROOT, config.sfx.dir, "manifest.json"), "utf8")
  );
  for (const [cue, name] of Object.entries(CUES)) {
    assert.ok(manifest[name], `${cue}: "${name}" is not in the library`);
    assert.equal(typeof PEAK[name], "number", `${cue}: "${name}" has no PEAK`);
  }
});
