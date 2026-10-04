import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DayGroup, FeedItem } from "../lib/types";
import { DaySection } from "./DaySection";

const item: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://www.example.com/post",
  title: "A story",
  title_vi: null,
  summary: null,
  summary_vi: null,
  category: "models",
  published_at: 1_700_000_000,
  points: 0,
  comments: 0,
  rank_score: 1,
  source_id: "hn",
  tags: [],
  sources: [],
  llm_tokens: 0,
  image_url: null,
};

const day: DayGroup = {
  date: "2026-10-04",
  items: [item],
  categoryCounts: {
    models: 8,
    agents: 7,
    chips: 6,
    research: 5,
    policy: 4,
    product: 3,
    open: 2,
    other: 1,
  },
};

describe("day category overflow", () => {
  it("says '+N nữa' under a Vietnamese heading", () => {
    const html = renderToStaticMarkup(<DaySection day={day} lang="vi" />);
    expect(html).toContain("+1 nữa");
    expect(html).not.toContain("more");
  });

  it("keeps '+N more' in English", () => {
    const html = renderToStaticMarkup(<DaySection day={day} lang="en" />);
    expect(html).toContain("+1 more");
  });
});
