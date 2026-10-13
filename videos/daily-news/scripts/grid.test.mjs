// node --test videos/daily-news/scripts/*.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { AREAS, GRID, gridCss } from "./grid.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
// fetch.mjs takes up to config.count bullets (fewer on a thin day), fetch-week.mjs up to config.weekCount.
const maxStories = Math.max(config.count, config.weekCount);

// Each area name -> the cells it covers, as [row, col].
const cellsOf = (areas) => {
  const cells = {};
  for (const [r, row] of areas.entries())
    for (const [c, name] of row.split(" ").entries()) {
      cells[name] ??= [];
      cells[name].push([r, c]);
    }
  return cells;
};

test("every story count the pipeline can emit has a full layout in every format", () => {
  for (const fmt of Object.keys(config.formats))
    for (let n = 1; n <= maxStories; n++) {
      const g = GRID[fmt]?.[n];
      assert.ok(g, `${fmt}: no layout for ${n} stories`);
      const width = g.areas[0].split(" ").length;
      for (const row of g.areas) assert.equal(row.split(" ").length, width, `${fmt} n=${n}: ragged row "${row}"`);
      const cells = cellsOf(g.areas);
      assert.deepEqual(Object.keys(cells).sort(), [...AREAS.slice(0, n)], `${fmt} n=${n}: one area per tile, no empty cell`);
      for (const [name, cs] of Object.entries(cells)) {
        const rows = cs.map(([r]) => r);
        const cols = cs.map(([, c]) => c);
        const h = Math.max(...rows) - Math.min(...rows) + 1;
        const w = Math.max(...cols) - Math.min(...cols) + 1;
        assert.equal(cs.length, h * w, `${fmt} n=${n}: area ${name} is not a rectangle`);
      }
      const lead = cells.a.length;
      for (const cs of Object.values(cells)) assert.ok(cs.length <= lead, `${fmt} n=${n}: a tile is bigger than the lead`);
      if (g.cols) assert.equal(g.cols.split(" ").length, width, `${fmt} n=${n}: column tracks`);
      if (g.rows) assert.equal(g.rows.split(" ").length, g.areas.length, `${fmt} n=${n}: row tracks`);
      if (cells.a.length > 1) assert.ok(g.hero > g.type, `${fmt} n=${n}: the hero tile has bigger type`);
    }
});

test("fewer stories means bigger type", () => {
  for (const fmt of Object.keys(GRID)) {
    assert.ok(GRID[fmt][2].type > GRID[fmt][4].type, `${fmt}: 2 > 4`);
    assert.ok(GRID[fmt][4].type > GRID[fmt][6].type, `${fmt}: 4 > 6`);
  }
});

test("the six-story grid is today's 3x2 (16:9) and 2x3 (9:16) at today's type size", () => {
  assert.deepEqual(GRID["16x9"][6], { areas: ["a b c", "d e f"], type: 1 });
  assert.deepEqual(GRID["9x16"][6], { areas: ["a b", "c d", "e f"], type: 1 });
  assert.match(gridCss(6), /\.f-16x9 \.tiles\[data-n="6"\]\{grid-template-areas:"a b c" "d e f";grid-template-columns:repeat\(3,1fr\);grid-template-rows:repeat\(2,1fr\)/);
  assert.match(gridCss(6), /\.f-9x16 \.tiles\[data-n="6"\]\{grid-template-areas:"a b" "c d" "e f";grid-template-columns:repeat\(2,1fr\);grid-template-rows:repeat\(3,1fr\)/);
});

test("a count with no layout fails the build instead of leaving cells empty", () => {
  assert.throws(() => gridCss(maxStories + 1), new RegExp(`no 16x9 layout for ${maxStories + 1} stories`));
});

test("the built intro tags the grid with its story count and carries that count's layout", () => {
  // build.mjs resolves its root from its own path, so a temp root links the real scripts and template.
  const tmp = mkdtempSync(join(tmpdir(), "grid-build-"));
  try {
    const dn = join(tmp, "daily-news");
    mkdirSync(join(dn, "editions"), { recursive: true });
    for (const f of ["scripts", "template", "config.json"]) symlinkSync(join(ROOT, f), join(dn, f));
    symlinkSync(resolve(ROOT, "../brand"), join(tmp, "brand"));
    const date = "2026-10-13";
    mkdirSync(join(dn, "editions", date));
    for (const f of ["edition.json", "script.json"]) cpSync(join(ROOT, "editions", date, f), join(dn, "editions", date, f));
    const n = JSON.parse(readFileSync(join(dn, "editions", date, "script.json"), "utf8")).stories.length;
    execFileSync(
      process.execPath,
      ["--preserve-symlinks", "--preserve-symlinks-main", join(dn, "scripts/build.mjs"), date, "--no-voice", "--no-audio"],
      { cwd: dn, stdio: "ignore" }
    );
    for (const fmt of Object.keys(config.formats)) {
      const html = readFileSync(join(dn, "editions", date, "out", fmt, "index.html"), "utf8");
      assert.match(html, new RegExp(`<div class="tiles" data-n="${n}">`), `${fmt}: .tiles carries data-n`);
      assert.ok(html.includes(`.f-${fmt} .tiles[data-n="${n}"]{grid-template-areas:`), `${fmt}: the ${n}-story layout is in the page`);
      assert.equal(html.match(/class="tile[ "]/g).length, n, `${fmt}: one tile per story`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
