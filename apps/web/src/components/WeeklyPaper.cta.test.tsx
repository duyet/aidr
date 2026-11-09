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

  it("carries prev/next at the foot as well as the head nav", () => {
    expect(html).toContain('rel="prev"');
    expect(html).toContain("Previous issue");
  });

  it("closes with the daily editions as pill chips", () => {
    expect(html).toContain("Daily editions");
    expect(html).toContain("/date/2026-10-05?lang=en");
    expect(html).toContain("Markdown");
  });
});
