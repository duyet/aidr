// node --test videos/daily-news/scripts/*.test.mjs
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { templateScript } from "./auto-script.mjs";
import { dayNumber, resolveLook, rotate } from "./look.mjs";
import { isoWeekOf } from "./week.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const hosts = ["alex", "allison", "tyler-cruz", "ivanna", "kristen"];
const DAY = 86400000;
const datesFrom = (start, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * DAY).toISOString().slice(0, 10));
const POOLS = [["paper", "soft"], ["wipe", "ink", "shutter"], ["a", "b", "c", "d"]];

test("CI's script for the next day gets a different transition and background (no look is written into the script)", () => {
  const e13 = read(join(ROOT, "editions/2026-10-13/edition.json"));
  const e14 = { ...e13, date: "2026-10-14" };
  const s13 = templateScript(e13, hosts);
  const s14 = templateScript(e14, hosts);
  assert.equal("theme" in s13, false);
  const [a, b] = [resolveLook(s13, e13), resolveLook(s14, e14)];
  assert.notEqual(a.transition, b.transition);
  assert.notEqual(a.background, b.background);
  assert.equal(b.intro, "grid");
});

test("rotate never repeats on adjacent days over two years, for pools of 2, 3 and 4", () => {
  const days = datesFrom("2026-01-01", 731).map(dayNumber);
  for (const pool of POOLS)
    for (const axis of ["transition", "background", "x"])
      for (let i = 1; i < days.length; i++)
        assert.notEqual(rotate(pool, days[i], axis), rotate(pool, days[i - 1], axis), `${pool.length} ids, ${axis}, day ${days[i]}`);
});

test("rotate never repeats on adjacent weeks over two years, across a 53-week year", () => {
  const keys = datesFrom("2026-01-05", 104 * 7).filter((_, i) => i % 7 === 0).map((d) => `week-${isoWeekOf(d)}`);
  assert.ok(keys.includes("week-2026-W53") && keys.includes("week-2027-W01"));
  const weeks = keys.map(dayNumber);
  for (let i = 1; i < weeks.length; i++) assert.equal(weeks[i], weeks[i - 1] + 1, keys[i]);
  for (const pool of POOLS)
    for (let i = 1; i < weeks.length; i++) assert.notEqual(rotate(pool, weeks[i], "transition"), rotate(pool, weeks[i - 1], "transition"), `${pool.length} ids, ${keys[i]}`);
});

test("rotate shows every id once per cycle, and the same day always gets the same id whatever the list order", () => {
  const start = dayNumber("2026-01-01");
  for (const pool of POOLS) {
    const n = pool.length;
    const first = Math.ceil(start / n) * n;
    for (let c = 0; c < 730 / n; c++) {
      const cycle = Array.from({ length: n }, (_, i) => rotate(pool, first + c * n + i, "background"));
      assert.deepEqual([...cycle].sort(), [...pool].sort(), `cycle starting day ${first + c * n}`);
    }
    for (let day = start; day < start + 60; day++)
      assert.equal(rotate([...pool].reverse(), day, "background"), rotate(pool, day, "background"));
  }
});

test("the intro is the grid on every unpinned day (frame 0 is the thumbnail)", () => {
  const edition = { date: "2026-01-01" };
  for (const date of datesFrom("2026-01-01", 365)) assert.equal(resolveLook({}, { ...edition, date }).intro, "grid");
});

test("a theme in script.json pins that axis; the others still rotate", () => {
  const e13 = { date: "2026-10-13" };
  const free = resolveLook({}, e13);
  const other = ["wipe", "ink", "shutter"].find((t) => t !== free.transition);
  const look = resolveLook({ theme: { transition: other, intro: "date-slam", accent: "#E0B000" } }, e13);
  assert.deepEqual(look, { intro: "date-slam", transition: other, background: free.background, accent: "#E0B000" });
});

test("an unknown theme id or axis fails instead of falling back", () => {
  const e = { date: "2026-10-13" };
  assert.throws(() => resolveLook({ theme: { transition: "inq" } }, e), /script\.theme\.transition "inq": unknown; use wipe \| ink \| shutter/);
  assert.throws(() => resolveLook({ theme: { background: "ink" } }, e), /script\.theme\.background "ink"/);
  assert.throws(() => resolveLook({ theme: { transtion: "ink" } }, e), /script\.theme\.transtion: unknown/);
  assert.throws(() => resolveLook({}, { date: "2026-13" }), /look key "2026-13"/);
});

test("a committed script.json theme pins the whole look it shipped with", () => {
  const scripts = readdirSync(join(ROOT, "editions"))
    .map((d) => [join(ROOT, "editions", d, "script.json"), d])
    .filter(([p]) => existsSync(p));
  const pinned = scripts.filter(([p]) => read(p).theme);
  assert.ok(pinned.length >= 4, `only ${pinned.length} committed scripts carry a theme`);
  for (const [p, d] of pinned) assert.deepEqual(resolveLook(read(p), read(join(ROOT, "editions", d, "edition.json"))), read(p).theme, p);
});
