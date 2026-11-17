/**
 * @vitest-environment happy-dom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../../lib/analytics/track";
import type { CalendarDay, CalendarMonth } from "../../lib/calendar";
import { calendarPath } from "../../lib/calendar";
import { fetchCalendarMonth } from "../../lib/calendar-fn";
import { dayArchivePath } from "../../lib/day-archive";
import { LangContext } from "../../lib/lang-context";
import type { Lang } from "../../lib/types";
import { clearCalendarMonthCache } from "../calendar/useCalendarMonth";
import { CalendarButton } from "./CalendarButton";

vi.mock("../../lib/calendar-fn", () => ({ fetchCalendarMonth: vi.fn() }));
vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/" } }),
}));

function renderButton(lang: Lang, surface: "popover" | "sheet") {
  return render(
    <LangContext.Provider value={lang}>
      <CalendarButton lang={lang} surface={surface} className="nav-item" />
    </LangContext.Provider>
  );
}

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
const OPEN_EN = { name: "Calendar" };

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
    renderButton("en", "popover");
    const trigger = screen.getByRole("link", OPEN_EN);
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens, tracks, and links edition days to their day archive", async () => {
    renderButton("en", "popover");
    fireEvent.click(screen.getByRole("link", OPEN_EN));

    const dialog = await screen.findByRole("dialog");
    expect(
      screen.getByRole("link", OPEN_EN).getAttribute("aria-expanded")
    ).toBe("true");
    expect(track).toHaveBeenCalledExactlyOnceWith("calendar_open", {
      placement: "popover",
    });
    await within(dialog).findByText("October 2026");

    const nine = within(dialog).getByRole("link", {
      name: /^Friday, October 9: 4 stories/,
    });
    expect(nine.getAttribute("href")).toBe(dayArchivePath("2026-10-09", "en"));
    expect(nine.textContent).toBe("9");
  });

  it("renders days without an edition as plain text, not links", async () => {
    renderButton("en", "popover");
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
    renderButton("en", "popover");
    fireEvent.click(screen.getByRole("link", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("3 editions");
    expect(within(dialog).queryByText(/Top story/)).toBeNull();
  });

  it("marks today", async () => {
    renderButton("en", "popover");
    fireEvent.click(screen.getByRole("link", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October 2026");
    const current = dialog.querySelectorAll('[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe("11");
  });

  it("links the footer to the full calendar in the reader's language", async () => {
    renderButton("vi", "popover");
    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));
    const dialog = await screen.findByRole("dialog");
    const footer = within(dialog).getByRole("link", {
      name: "Xem tất cả số báo →",
    });
    expect(footer.getAttribute("href")).toBe(calendarPath("2026-10", "vi"));
  });

  it("fetches once, caches months, and bounds the month buttons", async () => {
    renderButton("en", "popover");
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
    renderButton("en", "popover");
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
    renderButton("en", "popover");
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
    renderButton("en", "sheet");
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
    renderButton("en", "sheet");
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
      placement: "sheet",
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
  it("opens once on a real mouse press, not open-then-closed", async () => {
    renderButton("en", "popover");
    const trigger = screen.getByRole("link", OPEN_EN);
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.mouseDown(trigger, { button: 0 });
    fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.mouseUp(trigger, { button: 0 });
    expect(fireEvent.click(trigger)).toBe(false);
    await screen.findByRole("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(track).toHaveBeenCalledExactlyOnceWith("calendar_open", {
      placement: "popover",
    });
  });

  it.each(["popover", "sheet"] as const)(
    "%s trigger is a link to /calendar that opens on a plain click only",
    async (surface) => {
      renderButton("vi", surface);
      const trigger = screen.getByRole("link", { name: "Calendar" });
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

  it("popover trigger opens on Enter and keeps the browser from following the link", async () => {
    renderButton("en", "popover");
    const trigger = screen.getByRole("link", OPEN_EN);
    trigger.focus();
    // Preventing the keydown is what stops a browser from turning Enter on a
    // focused link into a click that would navigate.
    expect(fireEvent.keyDown(trigger, { key: "Enter" })).toBe(false);
    await screen.findByRole("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(track).toHaveBeenCalledExactlyOnceWith("calendar_open", {
      placement: "popover",
    });
  });

  it("sheet trigger opens on Enter without navigating", async () => {
    renderButton("en", "sheet");
    const trigger = screen.getByRole("link", OPEN_EN);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(trigger, { key: "Enter" });
    // browsers turn Enter on a focused link into a click; happy-dom does not
    const navigated = fireEvent.click(trigger, { detail: 0 });
    await screen.findByRole("dialog");
    expect(navigated).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("CalendarButton month loading", () => {
  it("keeps the arrows and offers Retry when a non-current month fails", async () => {
    renderButton("en", "popover");
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

    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    await within(dialog).findByLabelText(/^Wednesday, September 30: 3 stories/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("joins an in-flight request when reopened", async () => {
    const slow = deferred<CalendarMonth>();
    fetchMock.mockReturnValueOnce(slow.promise as never);
    renderButton("en", "popover");
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
    renderButton("en", "popover");
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
    renderButton("en", "popover");
    fireEvent.click(screen.getByRole("link", OPEN_EN));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("October 2026");
    const current = dialog.querySelectorAll('[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe("11");
  });

  it("sheet rings the selection and marks today with a dot instead", async () => {
    renderButton("en", "sheet");
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
    renderButton("en", "sheet");
    const trigger = screen.getByRole("link", OPEN_EN);
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    pressEscape();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("has a localized close button", async () => {
    renderButton("vi", "sheet");
    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
