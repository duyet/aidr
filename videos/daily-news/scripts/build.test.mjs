// node --test videos/daily-news/scripts/*.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const FORMATS = Object.keys(config.formats);
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const tmps = [];
after(() => {
  for (const t of tmps) rmSync(t, { recursive: true, force: true });
});

// Builds a committed edition (no voice, no audio) in a temp root and returns the page reader.
// build.mjs resolves its root from its own path, so the temp root links the real scripts and template.
function build(date, edit = (script, edition) => [script, edition]) {
  const tmp = mkdtempSync(join(tmpdir(), "dn-build-"));
  tmps.push(tmp);
  const dn = join(tmp, "daily-news");
  mkdirSync(join(dn, "editions", date), { recursive: true });
  for (const f of ["scripts", "template", "config.json"]) symlinkSync(join(ROOT, f), join(dn, f));
  symlinkSync(resolve(ROOT, "../brand"), join(tmp, "brand"));
  const src = join(ROOT, "editions", date);
  const [script, edition] = edit(read(join(src, "script.json")), read(join(src, "edition.json")));
  writeFileSync(join(dn, "editions", date, "script.json"), JSON.stringify(script));
  writeFileSync(join(dn, "editions", date, "edition.json"), JSON.stringify(edition));
  const run = spawnSync(
    process.execPath,
    ["--preserve-symlinks", "--preserve-symlinks-main", join(dn, "scripts/build.mjs"), date, "--no-voice", "--no-audio"],
    { cwd: dn, encoding: "utf8" }
  );
  assert.equal(run.status, 0, run.stderr);
  return {
    script,
    stderr: run.stderr,
    page: (name) => readFileSync(join(dn, "editions", date, "out", name, "index.html"), "utf8"),
  };
}

const coverImg = (html) => html.match(/<img class="img" id="cover-img" src="([^"]+)"/)?.[1];

test("the built intro tags the grid with its story count and carries that count's layout", () => {
  const { script, page } = build("2026-10-13");
  const n = script.stories.length;
  for (const fmt of FORMATS) {
    const html = page(fmt);
    assert.match(html, new RegExp(`<div class="tiles" data-n="${n}">`), `${fmt}: .tiles carries data-n`);
    assert.ok(html.includes(`.f-${fmt} .tiles[data-n="${n}"]{grid-template-areas:`), `${fmt}: the ${n}-story layout is in the page`);
    assert.equal(html.match(/class="tile[ "]/g).length, n, `${fmt}: one tile per story`);
  }
});

const coverHook = (html) => html.match(/<div class="hook"><span>([^<]*)<\/span>/)?.[1];

test("a cover whose thumb story has no image takes picture and hook from the first story with an image", () => {
  // 2026-10-13: the thumb is story 2, an arxiv paper with no image; story 1 has one. A hook about the
  // paper over story 1's photo would pair one story's words with another's picture.
  const { script, page, stderr } = build("2026-10-13");
  const thumb = script.stories.find((s) => s.rank === script.thumb.story);
  const first = script.stories[0];
  assert.deepEqual(thumb.images, []);
  for (const fmt of FORMATS) {
    const html = page(`cover-${fmt}`);
    assert.equal(coverImg(html), first.images[0], `${fmt}: story 1's image`);
    assert.equal(coverHook(html), first.kicker, `${fmt}: story 1's hook`);
    assert.notEqual(coverHook(html), script.thumb.hook, `${fmt}: not the thumb story's hook`);
  }
  assert.match(stderr, /! cover: thumb story 2 has no image; the cover uses story 1/);
});

test("a cover whose thumb story has an image keeps it", () => {
  // 2026-10-10: the thumb is story 5, which has its own image (story 1 has one too).
  const { script, page, stderr } = build("2026-10-10");
  const thumb = script.stories.find((s) => s.rank === script.thumb.story);
  for (const fmt of FORMATS) {
    const html = page(`cover-${fmt}`);
    assert.equal(coverImg(html), thumb.images[0], fmt);
    assert.equal(coverHook(html), script.thumb.hook, fmt);
  }
  assert.doesNotMatch(stderr, /! cover:/);
});

test("a cover with no story image anywhere shows the thumb story's paper card", () => {
  const { script, page } = build("2026-10-13", (script, edition) => [
    { ...script, stories: script.stories.map((s) => ({ ...s, images: [] })) },
    { ...edition, stories: edition.stories.map((s) => ({ ...s, images: [] })) },
  ]);
  for (const fmt of FORMATS) {
    const html = page(`cover-${fmt}`);
    assert.equal(coverImg(html), undefined, fmt);
    assert.ok(
      html.includes('<div class="panel"><span>arxiv.org</span><b>AI Models Can Provably Hide Arbitrary Capabilities</b></div>'),
      `${fmt}: the paper card fills the picture side`
    );
    assert.equal(coverHook(html), script.thumb.hook, `${fmt}: the thumb story's hook with its paper card`);
  }
});
