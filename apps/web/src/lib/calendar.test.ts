import { describe, expect, it } from "vitest";
import {
  calendarPath,
  daysInMonth,
  firstWeekdayMon0,
  heatLevel,
  monthCells,
  monthWeeks,
  moveDay,
  parseMonth,
  shiftMonth,
} from "./calendar";

const NOW = Date.parse("2026-10-11T12:00:00Z");

describe("calendar", () => {
  it("parses months up to the current one", () => {
    expect(parseMonth("2026-10", NOW)).toBe("2026-10");
    expect(parseMonth("2026-08", NOW)).toBe("2026-08");
    expect(parseMonth("2026-11", NOW)).toBeNull();
    expect(parseMonth("2026-13", NOW)).toBeNull();
    expect(parseMonth("2026-1", NOW)).toBeNull();
    expect(parseMonth(undefined, NOW)).toBeNull();
  });

  it("shifts across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("knows month shape", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-09")).toBe(30);
    // 2026-09-01 is a Tuesday
    expect(firstWeekdayMon0("2026-09")).toBe(1);
  });

  it("ramps heat relative to the busiest day", () => {
    expect(heatLevel(0, 50)).toBe(0);
    expect(heatLevel(5, 50)).toBe(1);
    expect(heatLevel(20, 50)).toBe(2);
    expect(heatLevel(30, 50)).toBe(3);
    expect(heatLevel(50, 50)).toBe(4);
  });

  it("builds paths", () => {
    expect(calendarPath()).toBe("/calendar");
    expect(calendarPath("2026-09", "vi")).toBe(
      "/calendar?month=2026-09&lang=vi"
    );
  });

  describe("monthCells", () => {
    it("has 29 days in a leap February", () => {
      const cells = monthCells("2028-02").filter(Boolean);
      expect(cells).toHaveLength(29);
      expect(cells.at(-1)).toBe("2028-02-29");
    });

    it("pads six cells before a month that starts on Sunday", () => {
      const cells = monthCells("2026-02");
      expect(cells.slice(0, 6)).toEqual(Array(6).fill(null));
      expect(cells[6]).toBe("2026-02-01");
    });

    it("has no padding for a month that starts on Monday", () => {
      expect(monthCells("2026-06")[0]).toBe("2026-06-01");
    });
  });
});

describe("moveDay", () => {
  const days = ["2026-10-02", "2026-10-03", "2026-10-09", "2026-10-11"];
  it("steps to the nearest edition in each direction", () => {
    expect(moveDay(days, "2026-10-03", "ArrowRight")).toBe("2026-10-09");
    expect(moveDay(days, "2026-10-09", "ArrowLeft")).toBe("2026-10-03");
    expect(moveDay(days, "2026-10-02", "ArrowDown")).toBe("2026-10-09");
    expect(moveDay(days, "2026-10-09", "ArrowUp")).toBe("2026-10-02");
  });
  it("stays put at the edges and for other keys", () => {
    expect(moveDay(days, "2026-10-11", "ArrowRight")).toBe("2026-10-11");
    expect(moveDay(days, "2026-10-02", "ArrowLeft")).toBe("2026-10-02");
    expect(moveDay(days, "2026-10-03", "a")).toBe("2026-10-03");
    expect(moveDay([], "2026-10-03", "Home")).toBe("2026-10-03");
  });
  it("jumps with Home and End", () => {
    expect(moveDay(days, "2026-10-09", "Home")).toBe("2026-10-02");
    expect(moveDay(days, "2026-10-09", "End")).toBe("2026-10-11");
  });
});

describe("monthWeeks", () => {
  it("lists closed weekly-edition weeks touching the month", () => {
    expect(monthWeeks("2026-10", "2026-10-11")).toEqual(["2026-W40"]);
    expect(monthWeeks("2026-10", "2026-10-26")).toEqual([
      "2026-W40",
      "2026-W41",
      "2026-W42",
      "2026-W43",
    ]);
  });
  it("skips weeks before the first edition", () => {
    expect(monthWeeks("2026-09", "2026-10-26")).toEqual(["2026-W40"]);
    expect(monthWeeks("2026-08", "2026-10-26")).toEqual([]);
  });
});
