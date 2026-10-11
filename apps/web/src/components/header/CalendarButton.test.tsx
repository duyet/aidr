/**
 * @vitest-environment happy-dom
 */
import { track } from "@aidr/ui/track";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarDay, CalendarMonth } from "../../lib/calendar";
import { calendarPath } from "../../lib/calendar";
import { fetchCalendarMonth } from "../../lib/calendar-fn";
import { dayArchivePath } from "../../lib/day-archive";
import { clearCalendarMonthCache } from "../calendar/useCalendarMonth";
import { CalendarButton } from "./CalendarButton";

vi.mock("../../lib/calendar-fn", () => ({ fetchCalendarMonth: vi.fn() }));
vi.mock("@aidr/ui/track", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aidr/ui/track")>()),
  track: vi.fn(),
}));

const day = (date: string, count: number): CalendarDay => ({
  date,
  count,
  title: `Top story ${date}`,
  title_vi: null,
  image_url: null,
  tags: [],
});

const OCTOBER: CalendarMonth = {
  month: "2026-10",
  days: [day("2026-10-09", 4), day("2026-10-10", 1), day("2026-10-11", 2)],
  firstMonth: "2026-09",
  lastMonth: "2026-10",
};
const SEPTEMBER: CalendarMonth = {
  month: "2026-09",
  days: [day("2026-09-30", 3)],
  firstMonth: "2026-09",
  lastMonth: "2026-10",
};

const fetchMock = vi.mocked(fetchCalendarMonth);
const OPEN_EN = { name: "Browse past editions" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T05:00:00Z"));
  fetchMock.mockImplementation((async ({
    data,
  }: {
    data: { month?: string };
  }) => (data.month === "2026-09" ? SEPTEMBER : OCTOBER)) as never);
});

afterEach(() => {
  cleanup();
  clearCalendarMonthCache();
  fetchMock.mockReset();
  vi.mocked(track).mockClear();
  vi.useRealTimers();
});

describe("CalendarButton popover", () => {
  it("fetches nothing until the icon is opened", () => {
    render(<CalendarButton lang="en" surface="popover" />);
    const trigger = screen.getByRole("button", OPEN_EN);
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens, tracks, and links edition days to their day archive", async () => {
    render(<CalendarButton lang="en" surface="popover" />);
    fireEvent.click(screen.getByRole("button", OPEN_EN));

    const dialog = await screen.findByRole("dialog");
    expect(
      screen.getByRole("button", OPEN_EN).getAttribute("aria-expanded")
    ).toBe("true");
    expect(track).toHaveBeenCalledExactlyOnceWith("calendar_open", {
      surface: "popover",
    });
    await within(dialog).findByText("October 2026");

    const nine = within(dialog).getByRole("link", { name: /^2026-10-09: 4/ });
    expect(nine.getAttribute("href")).toBe(dayArchivePath("2026-10-09", "en"));
    expect(nine.textContent).toBe("9");
  });

  it("renders days without an edition as plain text, not links", async () => {
    render(<CalendarButton lang="en" surface="popover" />);
    fireEvent.click(screen.getByRole("button", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October 2026");

    const links = within(dialog)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      dayArchivePath("2026-10-09", "en"),
      dayArchivePath("2026-10-10", "en"),
      dayArchivePath("2026-10-11", "en"),
      calendarPath("2026-10", "en"),
    ]);
    const empty = within(dialog).getByText("8");
    expect(empty.closest("a")).toBeNull();
  });

  it("shows the month's edition count and no day preview", async () => {
    render(<CalendarButton lang="en" surface="popover" />);
    fireEvent.click(screen.getByRole("button", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("3 editions");
    expect(within(dialog).queryByText(/Top story/)).toBeNull();
  });

  it("marks today", async () => {
    render(<CalendarButton lang="en" surface="popover" />);
    fireEvent.click(screen.getByRole("button", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October 2026");
    const current = dialog.querySelectorAll('[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe("11");
  });

  it("links the footer to the full calendar in the reader's language", async () => {
    render(<CalendarButton lang="vi" surface="popover" />);
    fireEvent.click(screen.getByRole("button", { name: "Lịch các số báo" }));
    const dialog = await screen.findByRole("dialog");
    const footer = within(dialog).getByRole("link", {
      name: "Xem tất cả số báo →",
    });
    expect(footer.getAttribute("href")).toBe(calendarPath("2026-10", "vi"));
  });

  it("fetches once, caches months, and bounds the month buttons", async () => {
    render(<CalendarButton lang="en" surface="popover" />);
    const open = () => fireEvent.click(screen.getByRole("button", OPEN_EN));
    open();
    let dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October 2026");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const next = within(dialog).getByRole("button", { name: "Next month" });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Previous month" })
    );
    await within(dialog).findByText("September 2026");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Previous month",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    open();
    dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October 2026");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns focus to the icon when Escape closes it", async () => {
    render(<CalendarButton lang="en" surface="popover" />);
    const trigger = screen.getByRole("button", OPEN_EN);
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("shows a one-line error and retries on the next open", async () => {
    fetchMock.mockResolvedValueOnce(null as never);
    render(<CalendarButton lang="en" surface="popover" />);
    fireEvent.click(screen.getByRole("button", OPEN_EN));
    await screen.findByText("The calendar could not be loaded.");
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", OPEN_EN));
    await screen.findByText("October 2026");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("CalendarButton phone sheet", () => {
  it("previews the latest edition by default and selects a tapped day without navigating", async () => {
    render(<CalendarButton lang="en" surface="sheet" />);
    fireEvent.click(screen.getByRole("button", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October");

    const previewLink = () =>
      within(dialog).getByRole("link", { name: /Oct \d+ · \d/ });
    expect(previewLink().getAttribute("href")).toBe(
      dayArchivePath("2026-10-11", "en")
    );

    const tile = within(dialog).getByRole("link", { name: /^2026-10-09: 4/ });
    expect(fireEvent.click(tile)).toBe(false);
    expect(previewLink().getAttribute("href")).toBe(
      dayArchivePath("2026-10-09", "en")
    );
    expect(previewLink().textContent).toContain("Fri, Oct 9 · 4");
  });

  it("opens a bottom sheet with the same grid and tracks the surface", async () => {
    render(<CalendarButton lang="en" surface="sheet" />);
    fireEvent.click(screen.getByRole("button", OPEN_EN));
    const dialog = await screen.findByRole("dialog", {
      name: "Browse past editions",
    });
    expect(dialog.getAttribute("data-side")).toBe("bottom");
    await within(dialog).findByText("October");
    expect(
      within(dialog)
        .getByRole("link", { name: /^2026-10-10: 1 story/ })
        .getAttribute("href")
    ).toBe(dayArchivePath("2026-10-10", "en"));
    expect(
      within(dialog).getByRole("link", { name: "All editions →" })
    ).toBeTruthy();
    expect(track).toHaveBeenCalledExactlyOnceWith("calendar_open", {
      surface: "sheet",
    });
  });
});
