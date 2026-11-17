import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LangContext } from "../lib/lang-context";
import { DEFAULT_PREFS, PrefsContext } from "../lib/prefs";
import type { Lang } from "../lib/types";
import { DayHeader, dayBefore } from "./DayHeader";

function header(lang: Lang, prevDate: string | null, bilingual = false) {
  return renderToStaticMarkup(
    <LangContext.Provider value={lang}>
      <PrefsContext.Provider
        value={{ prefs: { ...DEFAULT_PREFS, bilingual }, setPrefs: () => {} }}
      >
        <DayHeader
          date="2026-11-15"
          prevDate={prevDate}
          total={42}
          updatedAt={1_780_000_960_000}
          lastFetchedAt={1_780_000_000}
          lang={lang}
        />
      </PrefsContext.Provider>
    </LangContext.Provider>
  );
}

describe("dayBefore", () => {
  it("steps back over month and year edges", () => {
    expect(dayBefore("2026-11-15")).toBe("2026-11-14");
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });
});

describe("DayHeader", () => {
  it("links the previous day to its archive page and disables next", () => {
    const html = header("en", "2026-11-14");
    expect(html).toMatch(
      /<a href="\/date\/2026-11-14[^"]*"[^>]*aria-label="Previous day"/
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Next day"/);
  });

  it("disables previous when there is no older day", () => {
    const html = header("en", null);
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Previous day"/
    );
  });

  it("names the arrows in Vietnamese", () => {
    const html = header("vi", "2026-11-14");
    expect(html).toContain('aria-label="Ngày trước"');
    expect(html).toContain('aria-label="Ngày sau"');
  });

  it("counts the stories and says how fresh they are", () => {
    expect(header("en", null)).toContain("42 stories · updated 16m ago");
    expect(header("vi", null)).toContain("42 tin · cập nhật 16 phút trước");
  });

  it("shows both languages when bilingual, the leading one first", () => {
    const html = header("vi", null, true);
    expect(html).toContain("15 thg 11");
    expect(html).toContain("Sunday");
    expect(html.indexOf("15 thg 11")).toBeLessThan(html.indexOf("Sunday"));
  });

  it("carries a masthead for the newspaper layout and keeps the heading out of it", () => {
    const html = header("en", null);
    expect(html).toContain("np-only np-masthead");
    expect(html).toContain("np-masthead-title");
    expect(html).toContain("np-hide");
    expect(html.match(/<h2/g)).toHaveLength(1);
    expect(html).not.toContain("<h1");
  });
});
