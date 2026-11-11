import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WeekSummary } from "../lib/week-model";
import { WeeklyMasthead } from "./WeeklyMasthead";

const LATEST: WeekSummary = {
  week: "2026-W45",
  issue: 6,
  start_date: "2026-11-02",
  end_date: "2026-11-08",
  intro_en: "intro",
  intro_vi: "giới thiệu",
  stories: 10,
  image_url: null,
  lead_tags: [],
};

describe("WeeklyMasthead", () => {
  it("links the title to the latest published issue", () => {
    const html = renderToStaticMarkup(
      <WeeklyMasthead latest={LATEST} lang="en" />
    );
    expect(html).toContain('href="/week/2026-W45?lang=en"');
    expect(html).toContain("Issue No. 6");
    expect(html).toContain("AI;DR Weekly");
    expect(html).toContain("Nov 2 – 8, 2026");
    // The link carries the arrow affordance.
    expect(html).toContain("lucide-arrow-right");
  });

  it("carries the subscribe action and the RSS link on the same card", () => {
    const html = renderToStaticMarkup(
      <WeeklyMasthead latest={LATEST} lang="en" />
    );
    expect(html).toContain("/subscribe?tab=email&amp;freq=weekly&amp;lang=en");
    expect(html).toContain("/subscribe?tab=rss&amp;lang=en");
    expect(html).toContain("Subscribe to the weekly email");
  });

  it("localizes the copy and the links for Vietnamese", () => {
    const html = renderToStaticMarkup(
      <WeeklyMasthead latest={LATEST} lang="vi" />
    );
    expect(html).toContain('href="/week/2026-W45?lang=vi"');
    expect(html).toContain("Số 6");
    expect(html).toContain("Đăng ký bản tin tuần");
    expect(html).not.toContain("Subscribe to the weekly email");
  });

  it("renders plain text without a link before the first issue", () => {
    const html = renderToStaticMarkup(
      <WeeklyMasthead latest={null} lang="en" />
    );
    expect(html).not.toContain('href="/week/');
    expect(html).toContain("AI;DR Weekly");
    expect(html).toContain("The archive");
  });
});
