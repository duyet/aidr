/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarDay } from "../../lib/calendar";
import { DayCard } from "./DayCard";
import { DayPreview } from "./DayPreview";
import { MonthAgenda } from "./MonthAgenda";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DAY: CalendarDay = {
  date: "2026-10-05",
  count: 96,
  title: "Sam Altman says the world should accept bad things",
  title_vi: null,
  image_url: "https://static.example.test/story-media/gone",
  tags: [],
  runners: [],
  categories: [],
};

const CASES: Array<[string, ReactElement]> = [
  ["agenda row", <MonthAgenda key="a" days={[DAY]} lang="en" />],
  ["day card", <DayCard key="c" day={DAY} lang="en" />],
  ["phone preview", <DayPreview key="p" day={DAY} lang="en" />],
];

/** Blanked to a transparent pixel: the muted slot stays, so nothing
 *  around it moves, and the broken-image icon never paints. */
function blanked(img: HTMLImageElement): boolean {
  return img.getAttribute("srcset")?.startsWith("data:image/gif") ?? false;
}

function thumb(container: HTMLElement): HTMLImageElement {
  const img = container.querySelector("img");
  if (!img) throw new Error("missing thumbnail");
  return img;
}

describe("calendar thumbnails", () => {
  it.each(CASES)(
    "swaps the dead %s image for the muted placeholder",
    (_, ui) => {
      // Still loading at mount, then the 404 arrives.
      vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
        false
      );
      const img = thumb(render(ui).container);
      expect(blanked(img)).toBe(false);
      fireEvent.error(img);
      expect(blanked(img)).toBe(true);
    }
  );

  it.each(CASES)(
    "swaps the %s image when it failed before hydration",
    (_, ui) => {
      // On the local dev server the 404 landed before React attached
      // onError, so the error event never reached the handler.
      vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
        true
      );
      vi.spyOn(
        HTMLImageElement.prototype,
        "naturalWidth",
        "get"
      ).mockReturnValue(0);
      expect(blanked(thumb(render(ui).container))).toBe(true);
    }
  );

  it.each(CASES)("leaves a loaded %s image visible", (_, ui) => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      true
    );
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
      640
    );
    expect(blanked(thumb(render(ui).container))).toBe(false);
  });

  it("shows the next day's live image after a dead one", () => {
    // The day card and phone preview re-render one instance as the reader
    // picks days; a blank srcset left on a reused img hid every later image.
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      false
    );
    const { container, rerender } = render(<DayCard day={DAY} lang="en" />);
    fireEvent.error(thumb(container));
    rerender(
      <DayCard
        day={{
          ...DAY,
          date: "2026-10-06",
          image_url: "https://img.example/live.jpg",
        }}
        lang="en"
      />
    );
    expect(blanked(thumb(container))).toBe(false);
  });
});
