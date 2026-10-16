import { describe, expect, it } from "vitest";
import {
  AUDIENCE_TIMEZONE,
  localCalendarDate,
  toEpochSeconds,
} from "../time.js";

describe("toEpochSeconds", () => {
  it("converts a millisecond epoch timestamp to seconds", () => {
    // 2026-08-15T21:12:54.000Z in ms, as reported by the huggingnews bug
    expect(toEpochSeconds(1786847892625)).toBe(1786847892);
  });

  it("leaves an already-in-seconds timestamp unchanged", () => {
    expect(toEpochSeconds(1786847892)).toBe(1786847892);
  });

  it("floors fractional seconds input", () => {
    expect(toEpochSeconds(1786847892.9)).toBe(1786847892);
  });

  it("treats 0 as already seconds", () => {
    expect(toEpochSeconds(0)).toBe(0);
  });
});

describe("localCalendarDate", () => {
  it("returns the ICT calendar date across the UTC midnight gap", () => {
    expect(
      localCalendarDate(Date.UTC(2026, 7, 17, 17, 30, 0), AUDIENCE_TIMEZONE)
    ).toBe("2026-08-18");
    expect(
      localCalendarDate(Date.UTC(2026, 7, 17, 16, 30, 0), AUDIENCE_TIMEZONE)
    ).toBe("2026-08-17");
  });

  // The formatter is cached per timezone. A cache keyed on anything else
  // hands the first zone's formatter to the second and files rows on the
  // wrong day, so both zones are asked at an instant where their dates differ
  // and in both orders.
  describe("per-timezone formatter cache", () => {
    const instant = Date.UTC(2026, 7, 17, 17, 30, 0);
    const ict = "Asia/Ho_Chi_Minh";
    const ny = "America/New_York";

    it("keeps ICT and New York apart when ICT is asked first", () => {
      expect(localCalendarDate(instant, ict)).toBe("2026-08-18");
      expect(localCalendarDate(instant, ny)).toBe("2026-08-17");
    });

    it("keeps New York and ICT apart when New York is asked first", () => {
      expect(localCalendarDate(instant, ny)).toBe("2026-08-17");
      expect(localCalendarDate(instant, ict)).toBe("2026-08-18");
    });
  });
});
