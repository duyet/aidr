import { describe, expect, it } from "vitest";
import {
  calendarPath,
  daysInMonth,
  firstWeekdayMon0,
  heatLevel,
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
});
