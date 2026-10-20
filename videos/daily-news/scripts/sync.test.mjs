// Every effect peaks within one frame of a visual hit. The mix plays each file so its SFX `peak` lands on the cue,
// so the first tests check the peak against the file's own audio. The rest build an edition per variant, runs the built page's
// timeline (template/motion.js and the day's looks) against a recording GSAP, and checks each cue cuesFor returns
// for that page against the recorded tweens. The same harness checks which story images the page shows whole.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import vm from "node:vm";
import { AXES, entry } from "./looks/index.mjs";
import { cuesFor, POOLS, SFX } from "./looks/sound.mjs";
import { decode, loudness, PEAK_DB } from "./sound-measure.mjs";
import { ROOT, runBuild, scratchRoot } from "./scratch-root.mjs";

const FRAME = 1 / 30;
const DATE = "2026-10-13";
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const cleanups = [];
after(() => {
  for (const c of cleanups) c();
});

function buildPage(theme) {
  const { dn, cleanup } = scratchRoot();
  cleanups.push(cleanup);
  const ed = join(dn, "editions", DATE);
  mkdirSync(join(ed, "assets"), { recursive: true });
  const src = join(ROOT, "editions", DATE);
  const script = read(join(src, "script.json"));
  const edition = read(join(src, "edition.json"));
  writeFileSync(
    join(ed, "script.json"),
    JSON.stringify({ ...script, theme: { ...script.theme, ...theme } })
  );
  writeFileSync(join(ed, "edition.json"), JSON.stringify(edition));
  for (const f of new Set([
    ...script.stories.flatMap((s) => s.images ?? []),
    ...edition.stories.flatMap((s) => s.images.map((im) => im.local)),
  ]))
    writeFileSync(join(ed, f), "");
  const run = runBuild(dn, [DATE, "--no-voice", "--no-audio"]);
  assert.equal(run.status, 0, run.stderr);
  return readFileSync(join(ed, "out", "16x9", "index.html"), "utf8");
}

// A DOM stand-in rich enough for the page's measuring helpers: every element answers with fixed sizes, a story's
// media box is the 16:9 split layout's 1050 x 640, and each image has the aspect `page.ar`.
function element(sel, n, page) {
  const media = sel.endsWith(" .media");
  const el = {
    sel,
    style: {},
    dataset: sel.endsWith(" img") ? { ar: String(page.ar) } : {},
    classList: {
      add: (c) => page.added.push(`${sel}.${c}`),
      contains: () => false,
    },
    offsetWidth: media ? 1050 : 400,
    offsetHeight: media ? 640 : 300,
    scrollWidth: 400,
    clientWidth: 400,
    getAttribute: () => null,
    setAttribute() {},
    removeAttribute() {},
    closest: () => el,
    getBoundingClientRect: () => ({ top: 100, bottom: 0 }),
    querySelector: (s) => element(`${sel} ${s}`, n, page),
    querySelectorAll: (s) =>
      Array.from({ length: n }, (_, i) =>
        element(`${sel} ${s}[${i}]`, n, page)
      ),
  };
  el.parentElement = el;
  return el;
}

/** The tweens the built page puts on its timeline (target, start, duration, ease, repeat) and the classes it adds. */
async function tweensOf(html, ar = 1.6) {
  const D = JSON.parse(html.match(/<script>window\.__DN=(.*?);<\/script>/s)[1]);
  const look = html.match(/<script>(window\.__LOOK=.*?)<\/script>/s)[1];
  const tweens = [];
  const name = (t) =>
    [t]
      .flat()
      .map((x) => (typeof x === "string" ? x : x?.sel))
      .join(",");
  const tl = {};
  const rec = (target, vars, at) => {
    tweens.push({
      target: name(target),
      at: typeof at === "number" ? at : 0,
      dur: vars.duration ?? 0,
      ease: vars.ease ?? "power1.out",
      repeat: vars.repeat ?? 0,
    });
    return tl;
  };
  tl.fromTo = (t, _from, to, at) => rec(t, to, at);
  tl.from = (t, from, at) => rec(t, from, at);
  tl.to = (t, to, at) => rec(t, to, at);
  tl.set = (t, _to, at) => rec(t, {}, at);
  const n = D.stories.length;
  // Caption word markers are instant sets, never a hit, and the stand-in DOM does not know each cue's word count.
  D.caps = [];
  const page = { ar, added: [] };
  const document = element("", n, page);
  document.fonts = { ready: Promise.resolve() };
  const ctx = {
    __DN: D,
    __timelines: {},
    document,
    gsap: { timeline: () => tl },
    getComputedStyle: () => ({ fontSize: "40px", lineHeight: "42px" }),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(look, ctx);
  vm.runInContext(readFileSync(join(ROOT, "template/motion.js"), "utf8"), ctx);
  await document.fonts.ready;
  return { D, tweens, added: page.added };
}

// Where a tween changes the frame most: its first frame when it eases out, its middle when it eases in and out,
// its last when it eases in. A linear, repeating or instant tween has no hit.
function hitOf({ at, dur, ease, repeat }) {
  if (!dur || repeat || ease === "none") return null;
  const kind = ease.split(".")[1] ?? "out";
  return at + dur * { out: 0, inOut: 0.5, in: 1 }[kind];
}

function misses(tweens, cues) {
  const hits = tweens.map(hitOf).filter((h) => h !== null);
  return cues
    .filter(([cue]) => cue !== "open")
    .filter(([, at]) => !hits.some((h) => Math.abs(h - at) <= FRAME + 1e-6))
    .map(([cue, at]) => `${cue} at ${at}`);
}

const cuesOf = (D) =>
  cuesFor(
    D,
    entry("intro", D.intro.variant).cues({
      stories: D.stories,
      focus: D.intro.focus,
    })
  );

// A peak placed on the cue is only the hit if nothing in the file outside one frame of it is louder: notification's
// second note, 5 frames after its first, or a swell's crest 5 frames after a peak taken on its rise, sounds late.
function louderAway(file, peak) {
  const frames = loudness(decode(file, 48000), FRAME, 0.005);
  const near = frames.filter((f) => Math.abs(f.t - peak) <= FRAME + 1e-6);
  const level = Math.max(...near.map((f) => f.db));
  return frames.filter(
    (f) => Math.abs(f.t - peak) > FRAME + 1e-6 && f.db > level + PEAK_DB
  );
}

const config = read(join(ROOT, "config.json"));
const sfxDir = join(ROOT, config.sfx.dir);
const manifest = read(join(sfxDir, "manifest.json"));

test("every pool file is loudest within one frame of its SFX peak", () => {
  const late = [];
  for (const name of new Set(Object.values(POOLS).flat())) {
    const away = louderAway(join(sfxDir, manifest[name].file), SFX[name].peak);
    if (away.length)
      late.push(
        `${name}: louder at ${away[0].t.toFixed(3)} s than at ${SFX[name].peak} s`
      );
  }
  assert.deepEqual(late, []);
});

test("the peak check catches a peak taken on a swell's rise and a quieter first note", () => {
  const file = (n) => join(sfxDir, manifest[n].file);
  assert.ok(
    louderAway(file("whoosh-cinematic"), 2.35).length,
    "the old swell peak"
  );
  assert.ok(
    louderAway(file("notification"), 0.095).length,
    "notification's first note"
  );
});

test("every effect peaks within one frame of a visual hit, in every variant", async () => {
  const intros = AXES.intro.filter((e) => e.auto);
  const transitions = AXES.transition.filter((e) => e.auto);
  const choreographies = AXES.choreography.filter((e) => e.auto);
  const off = [];
  for (const [i, intro] of intros.entries()) {
    const theme = {
      intro: intro.id,
      transition: transitions[i % transitions.length].id,
      choreography: choreographies[i % choreographies.length].id,
    };
    const { D, tweens } = await tweensOf(buildPage(theme));
    assert.ok(D.intro.focus.length, `${intro.id}: the fixture has focus ticks`);
    for (const m of misses(tweens, cuesOf(D)))
      off.push(`${Object.values(theme).join("/")}: ${m}`);
  }
  assert.deepEqual(off, []);
});

test("the sync check catches an effect two frames off its hit", async () => {
  const { D, tweens } = await tweensOf(buildPage({}));
  const late = cuesOf(D).map(([cue, at, g]) =>
    cue === "statHit" ? [cue, at + 2 * FRAME, g] : [cue, at, g]
  );
  const m = misses(tweens, late);
  assert.equal(m.length, D.stories.length);
  assert.ok(m.every((x) => x.startsWith("statHit")));
});

test("an image far from its box's shape is shown whole; one close to it fills the box", async () => {
  const html = buildPage({});
  const fitted = async (ar) =>
    (await tweensOf(html, ar)).added.filter((c) => c.endsWith(".fit")).length;
  assert.ok((await fitted(2.0)) > 0, "a 2:1 social card in a 1.64 box");
  assert.equal(await fitted(1.78), 0, "a 16:9 photo in a 1.64 box");
});
