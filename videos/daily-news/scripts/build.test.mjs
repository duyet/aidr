// node --test videos/daily-news/scripts/*.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  execFileSync(
    process.execPath,
    ["--preserve-symlinks", "--preserve-symlinks-main", join(dn, "scripts/build.mjs"), date, "--no-voice", "--no-audio"],
    { cwd: dn, stdio: "ignore" }
  );
  return { script, page: (name) => readFileSync(join(dn, "editions", date, "out", name, "index.html"), "utf8") };
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

test("a cover whose thumb story has no image takes the first story image instead of leaving yellow", () => {
  // 2026-10-13: the thumb is story 2, an arxiv paper with no image; story 1 has one.
  const { script, page } = build("2026-10-13");
  const thumb = script.stories.find((s) => s.rank === script.thumb.story);
  assert.deepEqual(thumb.images, []);
  for (const fmt of FORMATS) {
    const html = page(`cover-${fmt}`);
    assert.equal(coverImg(html), script.stories[0].images[0], `${fmt}: story 1's image`);
    assert.ok(html.includes(`<div class="hook"><span>${script.thumb.hook}</span>`), `${fmt}: the hook stays the thumb story's`);
  }
});

test("a cover whose thumb story has an image keeps it", () => {
  // 2026-10-10: the thumb is story 5, which has its own image (story 1 has one too).
  const { script, page } = build("2026-10-10");
  const thumb = script.stories.find((s) => s.rank === script.thumb.story);
  for (const fmt of FORMATS) assert.equal(coverImg(page(`cover-${fmt}`)), thumb.images[0], fmt);
});

test("a cover with no story image anywhere shows the thumb story's paper card", () => {
  const { page } = build("2026-10-13", (script, edition) => [
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
  }
});
