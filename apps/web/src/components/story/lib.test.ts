import { describe, expect, it } from "vitest";
import { fmtTime } from "./lib";

// 2026-10-05T17:30:00Z is 00:30 on 6 Oct in Asia/Ho_Chi_Minh (UTC+7, no DST).
// Worker SSR defaults to UTC, so a missing timeZone jumps the clock after hydration.
const EPOCH_SEC = Date.parse("2026-10-05T17:30:00Z") / 1000;

const DATE_FIELDS = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;

describe("fmtTime", () => {
  it("formats the product day in Asia/Ho_Chi_Minh", () => {
    const instant = new Date(EPOCH_SEC * 1000);
    const ict = instant.toLocaleString("en-US", {
      ...DATE_FIELDS,
      timeZone: "Asia/Ho_Chi_Minh",
    });
    const utc = instant.toLocaleString("en-US", {
      ...DATE_FIELDS,
      timeZone: "UTC",
    });

    const formatted = fmtTime(EPOCH_SEC, "en");
    expect(formatted).toBe(ict);
    expect(formatted).not.toBe(utc);
    expect(formatted).toContain("Oct");
    expect(formatted).toContain("6");
    expect(formatted).toMatch(/12:30 AM|00:30/);
  });
});
