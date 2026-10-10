// Run: node --test scripts/week.test.mjs
// The Worker keys weekly snapshots by the ISO week of Asia/Ho_Chi_Minh dates, so the video must ask
// for the same key. A wrong key means a 404 or, worse, another week's stories under this week's name.
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRange, ictDate, isoWeekOf, lastClosedWeek, parseWeek } from "./week.mjs";

test("year-boundary dates use the ISO year, not the calendar year", () => {
  // 2026 has 53 ISO weeks; Jan 1 2027 (a Friday) still belongs to the last of them.
  assert.equal(isoWeekOf("2026-12-31"), "2026-W53");
  assert.equal(isoWeekOf("2027-01-01"), "2026-W53");
  assert.equal(isoWeekOf("2027-01-04"), "2027-W01");
  // Jan 3 2021 is a Sunday, so it closes 2020-W53.
  assert.equal(isoWeekOf("2021-01-03"), "2020-W53");
  assert.equal(isoWeekOf("2021-01-04"), "2021-W01");
  assert.equal(isoWeekOf("2026-10-05"), "2026-W41");
});

test("a week runs Monday to Sunday and round-trips with isoWeekOf", () => {
  assert.deepEqual(parseWeek("2026-W41"), { year: 2026, n: 41, start: "2026-10-05", end: "2026-10-11" });
  assert.equal(parseWeek("2026-W53").end, "2027-01-03");
  assert.equal(parseWeek("2020-W53").end, "2021-01-03");
  for (const w of ["2026-W01", "2026-W41", "2026-W53", "2027-W01"])
    assert.equal(isoWeekOf(parseWeek(w).start), w);
});

test("rejects weeks the Worker would never have a key for", () => {
  assert.throws(() => parseWeek("2027-W53")); // 2027 has 52 weeks
  assert.throws(() => parseWeek("2026-41"));
  assert.throws(() => parseWeek("2026-W00"));
});

test("last closed week is judged by the Ho Chi Minh date, not UTC", () => {
  // Sunday Oct 11 2026 is still inside W41 in ICT, so the last closed week is W40.
  assert.equal(lastClosedWeek(new Date("2026-10-11T12:00:00+07:00")), "2026-W40");
  // Monday Oct 12 00:30 ICT is Sunday 17:30 UTC: UTC alone would still say W41 is open.
  assert.equal(ictDate(new Date("2026-10-11T17:30:00Z")), "2026-10-12");
  assert.equal(lastClosedWeek(new Date("2026-10-11T17:30:00Z")), "2026-W41");
  // Across the year boundary.
  assert.equal(lastClosedWeek(new Date("2027-01-04T09:00:00+07:00")), "2026-W53");
  assert.equal(lastClosedWeek(new Date("2027-01-03T09:00:00+07:00")), "2026-W52");
});

test("date range label for the screen", () => {
  assert.equal(formatRange("2026-10-05", "2026-10-11"), "Oct 5–11, 2026");
  assert.equal(formatRange("2026-10-26", "2026-11-01"), "Oct 26 – Nov 1, 2026");
  assert.equal(formatRange("2026-12-28", "2027-01-03"), "Dec 28, 2026 – Jan 3, 2027");
  assert.equal(formatRange("2026-10-05", "2026-10-11", "vi-VN"), "5–11/10/2026");
});
