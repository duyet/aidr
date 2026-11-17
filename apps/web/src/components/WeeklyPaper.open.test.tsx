import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FeedItem } from "../lib/types";
import type { WeekEdition } from "../lib/week-model";
import { WeeklyPaper } from "./WeeklyPaper";

const item: FeedItem = {
  id: "aaaaaaaa11111111",
  url: "https://example.com/a",
  title: "A story",
  title_vi: "Một tin",
  summary: null,
  summary_vi: null,
  category: "Tools",
  published_at: 1_791_000_000,
  points: 0,
  comments: 0,
  rank_score: 0,
  source_id: "hn",
  tags: [],
  sources: [],
  llm_tokens: 0,
  image_url: null,
};

const provisional: WeekEdition = {
  week: "2026-W46",
  issue: 7,
  start_date: "2026-11-09",
  end_date: "2026-11-15",
  intro_en: null,
  intro_vi: null,
  stories: [{ rank: 1, item, text_en: "A line.", text_vi: "Một dòng." }],
  prevWeek: "2026-W45",
  nextWeek: null,
  updated_at: 0,
  provisional: true,
};

describe("WeeklyPaper provisional open week", () => {
  it("marks the edition as in progress with no editor intro", () => {
    const html = renderToStaticMarkup(
      <WeeklyPaper edition={provisional} lang="en" />
    );
    expect(html).toContain("In progress");
    expect(html).toContain("This week is still open");
    expect(html).toContain("Live ranking of the 1 AI stories so far");
    expect(html).not.toContain("From the editor");
  });

  it("marks the edition as in progress in Vietnamese", () => {
    const html = renderToStaticMarkup(
      <WeeklyPaper edition={provisional} lang="vi" />
    );
    expect(html).toContain("Đang diễn ra");
    expect(html).toContain("Tuần này vẫn đang mở");
    expect(html).toContain("Xếp hạng trực tiếp 1 tin AI");
  });
});
