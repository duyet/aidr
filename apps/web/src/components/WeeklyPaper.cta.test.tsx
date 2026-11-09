import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WeekEdition } from "../lib/week-model";
import { WeeklyPaper } from "./WeeklyPaper";

const edition: WeekEdition = {
  week: "2026-W41",
  issue: 2,
  start_date: "2026-10-05",
  end_date: "2026-10-11",
  intro_en: "Intro",
  intro_vi: null,
  stories: [],
  prevWeek: "2026-W40",
  nextWeek: null,
  updated_at: 0,
};

describe("WeeklyPaper subscribe + issue navigation", () => {
  const html = renderToStaticMarkup(
    <WeeklyPaper edition={edition} lang="en" />
  );

  it("links to the weekly subscribe flow", () => {
    expect(html).toContain("Subscribe to the weekly email");
    expect(html).toContain("freq=weekly");
  });

  it("keeps the foot free of the duplicated header navigation", () => {
    // The head nav already carries prev/next and the way back to the
    // archive; the foot is the daily editions and the Markdown twin.
    expect(html).not.toContain('rel="prev"');
    expect(html).not.toContain('rel="next"');
  });

  it("closes with the daily editions as plain links, not chips", () => {
    expect(html).toContain("Daily editions");
    expect(html).toContain("/date/2026-10-05?lang=en");
    expect(html).toContain("Markdown");
    expect(html).not.toMatch(/rounded-full[^>]*>2026-10-05/);
  });
});
