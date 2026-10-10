import { describe, expect, it } from "vitest";
import {
  formatWeekRange,
  isoWeekOfDate,
  lastClosedWeek,
  parseWeek,
  shiftWeek,
  WEEKLY_FIRST_WEEK,
  weekDates,
  weekIssue,
} from "./week";

/**
 * The weekly edition is keyed by the ISO week of Asia/Ho_Chi_Minh dates.
 * The ingest step writes that key, the page and API read it, and the video
 * script (`videos/daily-news/scripts/week.mjs`, same cases in its tests)
 * asks for it. If any of them disagree at a year edge or across the
 * UTC/ICT midnight gap, a week is written under one key and requested
 * under another, and the edition silently 404s.
 */
describe("ISO week keys", () => {
  it.each([
    ["2026-12-31", "2026-W53"],
    ["2027-01-01", "2026-W53"],
    ["2021-01-03", "2020-W53"],
    ["2021-01-04", "2021-W01"],
    ["2026-10-05", "2026-W41"],
    ["2026-10-11", "2026-W41"],
  ])("%s is in %s", (date, week) => {
    expect(isoWeekOfDate(date)).toBe(week);
  });

  it("lists Monday..Sunday, and rejects a W53 the year does not have", () => {
    expect(weekDates("2026-W41")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    // 2025 has 52 ISO weeks: a W53 key must not quietly mean 2026-W01.
    expect(weekDates("2025-W53")).toBeNull();
    expect(weekDates("2026-W53")?.[0]).toBe("2026-12-28");
  });

  it("shifts across the year edge", () => {
    expect(shiftWeek("2026-W53", 1)).toBe("2027-W01");
    expect(shiftWeek("2027-W01", -1)).toBe("2026-W53");
  });
});

describe("last closed week (audience zone)", () => {
  it("is the week that just ended once Monday starts in ICT, even while UTC is still Sunday", () => {
    // 2026-10-11T18:00Z is Monday 01:00 in Ho Chi Minh City.
    expect(lastClosedWeek(Date.parse("2026-10-11T18:00:00Z"))).toBe("2026-W41");
    // Sunday 23:59 ICT: W41 is still open, so the last closed one is W40.
    expect(lastClosedWeek(Date.parse("2026-10-11T16:59:00Z"))).toBe("2026-W40");
  });
});

describe("parseWeek", () => {
  const monday = Date.parse("2026-10-12T03:00:00Z");

  it("accepts closed weeks from the first issue on", () => {
    expect(parseWeek("2026-W41", monday)).toBe("2026-W41");
    expect(parseWeek(WEEKLY_FIRST_WEEK, monday)).toBe(WEEKLY_FIRST_WEEK);
    expect(parseWeek("2026-w41", monday)).toBe("2026-W41");
  });

  it("rejects the open week, future weeks, pre-launch weeks and junk", () => {
    // The week in progress has no edition yet; it must 404, not render empty.
    expect(parseWeek("2026-W42", monday)).toBeNull();
    expect(parseWeek("2027-W01", monday)).toBeNull();
    expect(parseWeek("2026-W39", monday)).toBeNull();
    expect(parseWeek("2026-41", monday)).toBeNull();
    expect(parseWeek(undefined, monday)).toBeNull();
  });
});

describe("issue numbers", () => {
  it("count weeks from the first issue, so a rebuilt week keeps its number", () => {
    expect(weekIssue(WEEKLY_FIRST_WEEK)).toBe(1);
    expect(weekIssue("2026-W41")).toBe(2);
    expect(weekIssue("2026-W53")).toBe(14);
    expect(weekIssue("2027-W01")).toBe(15);
    expect(weekIssue("2026-W39")).toBeNull();
  });
});

describe("formatWeekRange", () => {
  it("prints one month once and spells a year-crossing range out", () => {
    expect(formatWeekRange("2026-10-05", "2026-10-11", "en")).toBe(
      "Oct 5 – 11, 2026"
    );
    expect(formatWeekRange("2026-12-28", "2027-01-03", "en")).toBe(
      "Dec 28, 2026 – Jan 3, 2027"
    );
    expect(formatWeekRange("2026-10-05", "2026-10-11", "vi")).toBe(
      "5 – 11 tháng 10, 2026"
    );
  });
});
