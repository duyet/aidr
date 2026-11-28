import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatWeekRange,
  isoWeekOfDate,
  lastClosedEdition,
  lastClosedWeek,
  weekDates,
  weekIssue,
} from "./week.js";

test("ISO weeks follow the Thursday rule at the year edge", () => {
  assert.equal(isoWeekOfDate("2027-01-01"), "2026-W53");
  assert.equal(isoWeekOfDate("2026-11-28"), "2026-W48");
  assert.equal(weekDates("2026-W48")?.[0], "2026-11-23");
});

test("the last closed week is the one before today's week, in Ho Chi Minh time", () => {
  // Sat 28 Nov 2026 (ICT) sits in W48, so W47 is the last closed week.
  assert.equal(lastClosedWeek(Date.parse("2026-11-28T09:00:00Z")), "2026-W47");
  // 17:30 UTC on Sunday is already Monday in ICT: W48 just ended.
  assert.equal(lastClosedWeek(Date.parse("2026-11-29T17:30:00Z")), "2026-W48");
});

test("issue numbers count from 2026-W40 and the rail line reads like the site", () => {
  assert.equal(weekIssue("2026-W40"), 1);
  assert.equal(weekIssue("2026-W39"), null);
  const edition = lastClosedEdition(Date.parse("2026-11-28T09:00:00Z"), "vi");
  assert.deepEqual(edition, { week: "2026-W47", issue: 8, range: "16 – 22 tháng 11, 2026" });
  assert.equal(formatWeekRange("2026-11-16", "2026-11-22", "en"), "Nov 16 – 22, 2026");
});
