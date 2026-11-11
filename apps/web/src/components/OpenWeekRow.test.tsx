import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OpenWeekSummary } from "../lib/week-model";
import { OpenWeekRow } from "./OpenWeekRow";

const open: OpenWeekSummary = {
  week: "2026-W46",
  issue: 7,
  start_date: "2026-11-09",
  end_date: "2026-11-15",
  image_url: null,
  lead_tags: ["Models"],
  stories: 10,
};

describe("OpenWeekRow", () => {
  it("links the in-progress week to its provisional edition", () => {
    const html = renderToStaticMarkup(<OpenWeekRow open={open} lang="en" />);
    expect(html).toContain('href="/week/2026-W46?lang=en"');
    expect(html).toContain("In progress");
    expect(html).toContain("10 stories so far");
    expect(html).toContain("Nov 9 – 15, 2026");
  });

  it("localizes the row for Vietnamese", () => {
    const html = renderToStaticMarkup(<OpenWeekRow open={open} lang="vi" />);
    expect(html).toContain('href="/week/2026-W46?lang=vi"');
    expect(html).toContain("Đang diễn ra");
    expect(html).toContain("10 tin đến hiện tại");
  });
});
