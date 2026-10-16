/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCalendarMonthCache } from "./useCalendarMonth";

vi.mock("../../lib/calendar-fn", () => ({
  fetchCalendarMonth: vi.fn(() => Promise.reject(new Error("d1 down"))),
}));

const { CalendarPanel } = await import("./CalendarPanel");

afterEach(() => {
  cleanup();
  clearCalendarMonthCache();
});

describe("CalendarPanel error state", () => {
  it("announces a failed load to screen readers (defect: the failure appeared silently)", async () => {
    await act(async () => {
      render(<CalendarPanel lang="en" surface="popover" />);
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("The calendar could not be loaded.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
