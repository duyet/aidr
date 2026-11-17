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

  it("has no footer prev/next nav; the head nav carries it", () => {
    expect(html).not.toContain('rel="prev"');
    expect(html).not.toContain('rel="next"');
  });

  it("links back to the weeks archive at the top and bottom", () => {
    expect(html).toContain("Back to all weeks");
    expect(html.match(/Back to all weeks/g)?.length).toBe(2);
  });

  it("offers a share-week action in the masthead", () => {
    expect(html).toContain(">Share</button>");
  });
});
