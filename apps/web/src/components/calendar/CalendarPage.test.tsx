/**
 * @vitest-environment happy-dom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CalendarDay, CalendarMonth } from "../../lib/calendar";
import { calendarPath } from "../../lib/calendar";
import { dayArchivePath } from "../../lib/day-archive";
import { weekPath } from "../../lib/week";
import { CalendarPage } from "./CalendarPage";

afterEach(cleanup);

const day = (
  date: string,
  count: number,
  extra: Partial<CalendarDay> = {}
) => ({
  date,
  count,
  title: `Lead ${date}`,
  title_vi: `Tin chính ${date}`,
  image_url: `https://img.example/${date}.jpg`,
  tags: [],
  runners: [],
  categories: [],
  ...extra,
});

const OCTOBER: CalendarMonth = {
  month: "2026-10",
  days: [
    day("2026-10-09", 4, {
      runners: [{ title: "Runner A", title_vi: null }],
      categories: ["Models"],
    }),
    day("2026-10-10", 1),
    day("2026-10-11", 33, {
      runners: [
        { title: "Runner B", title_vi: "Phụ B" },
        { title: "Runner C", title_vi: null },
      ],
      categories: ["Models", "Tools", "Policy"],
    }),
  ],
  firstMonth: "2026-09",
  lastMonth: "2026-10",
};

const preview = () => within(screen.getByTestId("calendar-preview"));
const tile = (name: RegExp) =>
  screen.getAllByRole("link", { name }).find((a) => a.closest("ol"))!;

describe("CalendarPage layout", () => {
  it("renders the sticky preview for wide screens and the agenda for phones", () => {
    render(<CalendarPage cal={OCTOBER} lang="en" today="2026-10-11" />);
    const aside = screen.getByTestId("calendar-preview");
    expect(aside.className).toContain("hidden");
    expect(aside.className).toContain("min-[860px]:block");
    expect(aside.className).toContain("sticky");
    expect(screen.getByTestId("calendar-agenda").className).toContain(
      "min-[860px]:hidden"
    );
  });

  it("shows the agenda at every width, and no preview, for an empty month", () => {
    render(
      <CalendarPage
        cal={{ ...OCTOBER, days: [] }}
        lang="en"
        today="2026-10-11"
      />
    );
    expect(screen.queryByTestId("calendar-preview")).toBeNull();
    const agenda = screen.getByTestId("calendar-agenda");
    expect(agenda.className).not.toContain("hidden");
    expect(within(agenda).getByText("No stories this month yet.")).toBeTruthy();
  });

  it("links the month arrows and Today to real calendar URLs", () => {
    render(<CalendarPage cal={OCTOBER} lang="vi" today="2026-10-11" />);
    expect(
      screen.getByRole("link", { name: "Tháng trước" }).getAttribute("href")
    ).toBe(calendarPath("2026-09", "vi"));
    expect(screen.queryByRole("link", { name: "Hôm nay" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Tháng sau" })).toBeNull();
  });

  it("links Today back to the current month from an older one", () => {
    render(
      <CalendarPage
        cal={{ ...OCTOBER, month: "2026-09", firstMonth: "2026-09" }}
        lang="vi"
        today="2026-10-11"
      />
    );
    expect(
      screen.getByRole("link", { name: "Hôm nay" }).getAttribute("href")
    ).toBe(calendarPath("2026-10", "vi"));
  });

  it("drops the previous-month link at the first month", () => {
    render(
      <CalendarPage
        cal={{ ...OCTOBER, month: "2026-09", firstMonth: "2026-09" }}
        lang="en"
        today="2026-10-11"
      />
    );
    expect(screen.queryByRole("link", { name: "Previous month" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Next month" }).getAttribute("href")
    ).toBe(calendarPath("2026-10", "en"));
  });
});

describe("CalendarPage preview", () => {
  it("defaults to the latest edition day", () => {
    render(<CalendarPage cal={OCTOBER} lang="en" today="2026-10-11" />);
    const p = preview();
    expect(p.getByRole("heading", { name: "Lead 2026-10-11" })).toBeTruthy();
    expect(p.getByText(/Sunday, October 11 · 33 stories/)).toBeTruthy();
    expect(
      p.getByRole("link", { name: "Open edition →" }).getAttribute("href")
    ).toBe(dayArchivePath("2026-10-11", "en"));
  });

  it("follows hover and focus, and keeps the last day when the pointer leaves", () => {
    render(<CalendarPage cal={OCTOBER} lang="en" today="2026-10-11" />);
    fireEvent.pointerEnter(tile(/October 9:/));
    expect(preview().getByRole("heading").textContent).toBe("Lead 2026-10-09");
    fireEvent.focus(tile(/October 10:/));
    expect(preview().getByRole("heading").textContent).toBe("Lead 2026-10-10");
    fireEvent.pointerLeave(tile(/October 10:/));
    expect(preview().getByRole("heading").textContent).toBe("Lead 2026-10-10");
  });

  it("rings the previewed tile and keeps every tile a link to its day archive", () => {
    render(<CalendarPage cal={OCTOBER} lang="en" today="2026-10-11" />);
    expect(tile(/October 11:/).className).toContain("ring-foreground");
    fireEvent.pointerEnter(tile(/October 9:/));
    expect(tile(/October 9:/).className).toContain("ring-foreground");
    expect(tile(/October 11:/).className).not.toContain("ring-foreground");
    expect(tile(/October 9:/).getAttribute("href")).toBe(
      dayArchivePath("2026-10-09", "en")
    );
  });

  it("lists runner-ups and the top three category chips", () => {
    render(<CalendarPage cal={OCTOBER} lang="en" today="2026-10-11" />);
    const p = preview();
    expect(p.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Runner B",
      "Runner C",
      "Models",
      "Tools",
      "Policy",
    ]);
  });

  it("omits runner-ups and chips when the day has none", () => {
    render(<CalendarPage cal={OCTOBER} lang="en" today="2026-10-11" />);
    fireEvent.pointerEnter(tile(/October 10:/));
    expect(preview().queryAllByRole("listitem")).toHaveLength(0);
  });

  it("in Vietnamese shows only translated runner-ups and the Vietnamese headline", () => {
    render(<CalendarPage cal={OCTOBER} lang="vi" today="2026-10-11" />);
    const p = preview();
    expect(p.getByRole("heading").textContent).toBe("Tin chính 2026-10-11");
    expect(p.getByText("Phụ B")).toBeTruthy();
    expect(p.queryByText("Runner C")).toBeNull();
    expect(p.getByText(/Chủ Nhật, 11 tháng 10 · 33 tin/)).toBeTruthy();
    expect(p.getByRole("link", { name: "Mở số báo →" })).toBeTruthy();
  });

  it("falls back to a neutral headline instead of the English one when untranslated", () => {
    const cal = {
      ...OCTOBER,
      days: [day("2026-10-11", 2, { title_vi: null })],
    };
    render(<CalendarPage cal={cal} lang="vi" today="2026-10-11" />);
    expect(preview().getByRole("heading").textContent).toBe(
      "Xem các tin trong ngày"
    );
  });
});

describe("CalendarPage agenda", () => {
  it("lists the month's editions newest first with day number, weekday and count", () => {
    render(<CalendarPage cal={OCTOBER} lang="vi" today="2026-10-11" />);
    const rows = within(screen.getByTestId("calendar-agenda")).getAllByRole(
      "link"
    );
    expect(rows.map((r) => r.getAttribute("href"))).toEqual([
      dayArchivePath("2026-10-11", "vi"),
      dayArchivePath("2026-10-10", "vi"),
      dayArchivePath("2026-10-09", "vi"),
    ]);
    expect(rows[0].textContent).toContain("11");
    expect(rows[0].textContent).toContain("CN");
    expect(rows[0].textContent).toContain("33 tin");
    expect(rows[0].textContent).toContain("Tin chính 2026-10-11");
    expect(rows[0].querySelector("img")?.getAttribute("src")).toBe(
      "https://img.example/2026-10-11.jpg"
    );
  });
});

describe("CalendarPage keyboard and extras", () => {
  it("keeps one tab stop on the previewed tile and moves focus with arrows", () => {
    render(<CalendarPage cal={OCTOBER} lang="en" today="2026-10-11" />);
    expect(tile(/October 11:/).getAttribute("tabindex")).toBeNull();
    expect(tile(/October 10:/).getAttribute("tabindex")).toBe("-1");
    tile(/October 11:/).focus();
    fireEvent.keyDown(tile(/October 11:/), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tile(/October 10:/));
    expect(preview().getByRole("heading").textContent).toBe("Lead 2026-10-10");
    fireEvent.keyDown(tile(/October 10:/), { key: "Home" });
    expect(document.activeElement).toBe(tile(/October 9:/));
    fireEvent.keyDown(tile(/October 9:/), { key: "End" });
    expect(document.activeElement).toBe(tile(/October 11:/));
    fireEvent.keyDown(tile(/October 11:/), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tile(/October 11:/));
  });

  it("labels the legend scale, no-edition and today keys", () => {
    render(<CalendarPage cal={OCTOBER} lang="en" today="2026-10-11" />);
    const legend = within(screen.getByTestId("calendar-legend"));
    expect(legend.getByText(/up to 33/)).toBeTruthy();
    expect(legend.getByText("No edition")).toBeTruthy();
    expect(legend.getByText("Today")).toBeTruthy();
  });

  it("disables Today on the current month", () => {
    render(<CalendarPage cal={OCTOBER} lang="en" today="2026-10-11" />);
    expect(
      screen.getByText("Today", { selector: "span[aria-disabled]" })
    ).toBeTruthy();
  });

  it("links closed weeks of the month to their weekly edition", () => {
    render(<CalendarPage cal={OCTOBER} lang="en" today="2026-10-11" />);
    const links = within(screen.getByTestId("calendar-weeks")).getAllByRole(
      "link"
    );
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      weekPath("2026-W40", "en"),
    ]);
    expect(links[0].textContent).toContain("W40");
  });

  it("omits the weekly strip when no week of the month has an edition", () => {
    render(
      <CalendarPage
        cal={{ ...OCTOBER, month: "2026-08", days: [] }}
        lang="en"
        today="2026-10-11"
      />
    );
    expect(screen.queryByTestId("calendar-weeks")).toBeNull();
  });
});
