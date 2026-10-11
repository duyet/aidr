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
  runners: [],
  categories: [],
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
    const trigger = screen.getByRole("link", OPEN_EN);
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens, tracks, and links edition days to their day archive", async () => {
    render(<CalendarButton lang="en" surface="popover" />);
    fireEvent.click(screen.getByRole("link", OPEN_EN));

    const dialog = await screen.findByRole("dialog");
    expect(
      screen.getByRole("link", OPEN_EN).getAttribute("aria-expanded")
    ).toBe("true");
    expect(track).toHaveBeenCalledExactlyOnceWith("calendar_open", {
      surface: "popover",
    });
    await within(dialog).findByText("October 2026");

    const nine = within(dialog).getByRole("link", {
      name: /^Friday, October 9: 4 stories/,
    });
    expect(nine.getAttribute("href")).toBe(dayArchivePath("2026-10-09", "en"));
    expect(nine.textContent).toBe("9");
  });

  it("renders days without an edition as plain text, not links", async () => {
    render(<CalendarButton lang="en" surface="popover" />);
    fireEvent.click(screen.getByRole("link", OPEN_EN));
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
    fireEvent.click(screen.getByRole("link", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("3 editions");
    expect(within(dialog).queryByText(/Top story/)).toBeNull();
  });

  it("marks today", async () => {
    render(<CalendarButton lang="en" surface="popover" />);
    fireEvent.click(screen.getByRole("link", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October 2026");
    const current = dialog.querySelectorAll('[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe("11");
  });

  it("links the footer to the full calendar in the reader's language", async () => {
    render(<CalendarButton lang="vi" surface="popover" />);
    fireEvent.click(screen.getByRole("link", { name: "Lịch các số báo" }));
    const dialog = await screen.findByRole("dialog");
    const footer = within(dialog).getByRole("link", {
      name: "Xem tất cả số báo →",
    });
    expect(footer.getAttribute("href")).toBe(calendarPath("2026-10", "vi"));
  });

  it("fetches once, caches months, and bounds the month buttons", async () => {
    render(<CalendarButton lang="en" surface="popover" />);
    const open = () => fireEvent.click(screen.getByRole("link", OPEN_EN));
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
    const trigger = screen.getByRole("link", OPEN_EN);
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
    fireEvent.click(screen.getByRole("link", OPEN_EN));
    await screen.findByText("The calendar could not be loaded.");
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("link", OPEN_EN));
    await screen.findByText("October 2026");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("CalendarButton phone sheet", () => {
  it("previews the latest edition by default and selects a tapped day without navigating", async () => {
    render(<CalendarButton lang="en" surface="sheet" />);
    fireEvent.click(screen.getByRole("link", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October");

    const previewLink = () =>
      within(dialog).getByRole("link", { name: /Oct \d+ · \d/ });
    expect(previewLink().getAttribute("href")).toBe(
      dayArchivePath("2026-10-11", "en")
    );

    const tile = within(dialog).getByRole("button", {
      name: /^Friday, October 9: 4 stories/,
    });
    expect(tile.tagName).toBe("BUTTON");
    fireEvent.click(tile);
    expect(previewLink().getAttribute("href")).toBe(
      dayArchivePath("2026-10-09", "en")
    );
    expect(previewLink().textContent).toContain("Fri, Oct 9 · 4");
  });

  it("opens a bottom sheet with the same grid and tracks the surface", async () => {
    render(<CalendarButton lang="en" surface="sheet" />);
    fireEvent.click(screen.getByRole("link", OPEN_EN));
    const dialog = await screen.findByRole("dialog", {
      name: "Browse past editions",
    });
    expect(dialog.getAttribute("data-side")).toBe("bottom");
    await within(dialog).findByText("October");
    const tile = within(dialog).getByRole("button", {
      name: /^Saturday, October 10: 1 story/,
    });
    expect(tile.getAttribute("aria-pressed")).toBe("false");
    expect(
      within(dialog).getByRole("link", { name: "All editions →" })
    ).toBeTruthy();
    expect(track).toHaveBeenCalledExactlyOnceWith("calendar_open", {
      surface: "sheet",
    });
  });
});

const RING_RE = /(^| )ring-2( |$)/;
const pressEscape = () =>
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: "Escape",
  });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("CalendarButton trigger without JS", () => {
  it.each(["popover", "sheet"] as const)(
    "%s trigger is a link to /calendar that opens on a plain click only",
    async (surface) => {
      render(<CalendarButton lang="vi" surface={surface} />);
      const trigger = screen.getByRole("link", { name: "Lịch các số báo" });
      expect(trigger.getAttribute("href")).toBe(calendarPath(undefined, "vi"));

      const modified = [
        { ctrlKey: true },
        { metaKey: true },
        { shiftKey: true },
        { altKey: true },
        { button: 1 },
      ];
      for (const init of modified) {
        expect(fireEvent.click(trigger, init)).toBe(true);
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(screen.queryByRole("dialog")).toBeNull();
      }
      expect(track).not.toHaveBeenCalled();

      expect(fireEvent.click(trigger)).toBe(false);
      await screen.findByRole("dialog");
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
    }
  );

  it.each(["popover", "sheet"] as const)(
    "%s trigger opens on Enter without navigating",
    async (surface) => {
      render(<CalendarButton lang="en" surface={surface} />);
      const trigger = screen.getByRole("link", OPEN_EN);
      trigger.focus();
      expect(document.activeElement).toBe(trigger);
      fireEvent.keyDown(trigger, { key: "Enter" });
      // browsers turn Enter on a focused link into a click; happy-dom does not
      const navigated = fireEvent.click(trigger, { detail: 0 });
      await screen.findByRole("dialog");
      expect(navigated).toBe(false);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
    }
  );
});

describe("CalendarButton month loading", () => {
  it("keeps the arrows and offers Retry when a non-current month fails", async () => {
    render(<CalendarButton lang="en" surface="popover" />);
    fireEvent.click(screen.getByRole("link", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October 2026");

    fetchMock.mockResolvedValueOnce(null as never);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Previous month" })
    );
    await within(dialog).findByText("The calendar could not be loaded.");
    expect(within(dialog).getByText("September 2026")).toBeTruthy();
    const next = within(dialog).getByRole("button", { name: "Next month" });
    expect((next as HTMLButtonElement).disabled).toBe(false);
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Previous month",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    await within(dialog).findByLabelText(/^Wednesday, September 30: 3 stories/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("joins an in-flight request when reopened", async () => {
    const slow = deferred<CalendarMonth>();
    fetchMock.mockReturnValueOnce(slow.promise as never);
    render(<CalendarButton lang="en" surface="popover" />);
    const trigger = screen.getByRole("link", OPEN_EN);
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    pressEscape();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    slow.resolve(OCTOBER);
    await screen.findByText("October 2026");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a slow response that resolves after a newer month", async () => {
    render(<CalendarButton lang="en" surface="popover" />);
    fireEvent.click(screen.getByRole("link", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October 2026");

    const slow = deferred<CalendarMonth>();
    fetchMock.mockReturnValueOnce(slow.promise as never);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Previous month" })
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Next month" }));
    await within(dialog).findByLabelText(/^Sunday, October 11/);

    slow.resolve(SEPTEMBER);
    await Promise.resolve();
    await Promise.resolve();
    expect(within(dialog).getByText("October 2026")).toBeTruthy();
    expect(within(dialog).queryByText("September 2026")).toBeNull();
  });
});

describe("CalendarButton today marker", () => {
  it("rolls to the next audience day at 20:00 UTC (UTC+7)", async () => {
    vi.setSystemTime(new Date("2026-10-10T20:00:00Z"));
    render(<CalendarButton lang="en" surface="popover" />);
    fireEvent.click(screen.getByRole("link", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October 2026");
    const current = dialog.querySelectorAll('[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe("11");
  });

  it("sheet rings the selection and marks today with a dot instead", async () => {
    render(<CalendarButton lang="en" surface="sheet" />);
    fireEvent.click(screen.getByRole("link", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October");

    const todayTile = dialog.querySelector('[aria-current="date"]');
    expect(todayTile?.querySelector("span.rounded-full")).not.toBeNull();
    expect(todayTile?.className).toMatch(RING_RE);

    fireEvent.click(
      within(dialog).getByRole("button", { name: /^Friday, October 9/ })
    );
    expect(todayTile?.className).not.toMatch(RING_RE);
    expect(
      within(dialog)
        .getByRole("button", { name: /^Friday, October 9/ })
        .getAttribute("aria-pressed")
    ).toBe("true");
  });
});

describe("CalendarButton sheet dismissal", () => {
  it("closes on Escape and returns focus to the trigger", async () => {
    render(<CalendarButton lang="en" surface="sheet" />);
    const trigger = screen.getByRole("link", OPEN_EN);
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    pressEscape();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("has a localized close button", async () => {
    render(<CalendarButton lang="vi" surface="sheet" />);
    fireEvent.click(screen.getByRole("link", { name: "Lịch các số báo" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
