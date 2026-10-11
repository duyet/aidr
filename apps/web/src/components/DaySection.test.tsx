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

// The homepage renders at most `limit` rows per day so a busy day does not
// put ~100 rows of markup in the first HTML. The rest stays one click away.
describe("day story limit", () => {
  const many = (n: number): DayGroup => ({
    ...day,
    items: Array.from({ length: n }, (_, i) => ({
      ...item,
      id: `abcdef12deadbe${String(i).padStart(2, "0")}`,
    })),
  });

  it("renders only `limit` rows and a bilingual Load more with the rest", () => {
    const vi = renderToStaticMarkup(
      <DaySection day={many(35)} lang="vi" limit={30} />
    );
    expect(vi.match(/id="item-/g)).toHaveLength(30);
    expect(vi).toContain("Xem thêm (5)");
    const en = renderToStaticMarkup(
      <DaySection day={many(35)} lang="en" limit={30} />
    );
    expect(en).toContain("Load more (5)");
  });

  it("counts the whole day when the payload carries only part of it", () => {
    const html = renderToStaticMarkup(
      <DaySection day={{ ...many(30), totalItems: 78 }} lang="en" limit={30} />
    );
    expect(html).toContain("78 stories");
    expect(html).toContain("Load more (48)");
  });

  it("shows every row and no button without a limit (date archive)", () => {
    const html = renderToStaticMarkup(<DaySection day={many(35)} lang="en" />);
    expect(html.match(/id="item-/g)).toHaveLength(35);
    expect(html).not.toContain("Load more");
  });
});
