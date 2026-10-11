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

// Owner picked the dense-table layout: one line per story in fixed columns
// (rank | title | topic | time | score) under a legend, with a phone
// fallback that keeps rank | title | score and moves topic + time under the
// title. These class names are the contract the layout hangs on.
describe("dense story table", () => {
  const rows = (n: number): DayGroup => ({
    ...day,
    items: Array.from({ length: n }, (_, i) => ({
      ...item,
      id: `abcdef12deadbe${String(i).padStart(2, "0")}`,
    })),
  });

  it("renders a bilingual aria-hidden legend on the same grid as rows", () => {
    const vi = renderToStaticMarkup(<DaySection day={day} lang="vi" />);
    const legend = vi.match(/<div class="story-legend[^"]*"[^>]*>/)?.[0] ?? "";
    expect(legend).toContain('aria-hidden="true"');
    expect(legend).toContain(
      "sm:grid-cols-[1.6rem_minmax(0,1fr)_7.5rem_5.5rem_3.2rem]"
    );
    for (const label of ["#", "Tin", "Chủ đề", "Lúc", "Điểm"]) {
      expect(vi).toContain(`>${label}<`);
    }
    const en = renderToStaticMarkup(<DaySection day={day} lang="en" />);
    for (const label of ["Story", "Topic", "Time", "Score"]) {
      expect(en).toContain(`>${label}<`);
    }
  });

  it("lays each row out in five columns with a three-column phone fallback", () => {
    const html = renderToStaticMarkup(<DaySection day={day} lang="en" />);
    const row = html.match(/<div class="story-row[^"]*"/)?.[0] ?? "";
    expect(row).toContain("grid-cols-[1.4rem_minmax(0,1fr)_3rem]");
    expect(row).toContain(
      "sm:grid-cols-[1.6rem_minmax(0,1fr)_7.5rem_5.5rem_3.2rem]"
    );
    // Desktop: one-line title; topic and time have their own columns.
    expect(html).toMatch(/class="story-title[^"]*sm:truncate/);
    expect(html).toMatch(/class="story-topic hidden[^"]*sm:block/);
    expect(html).toMatch(/class="story-time hidden[^"]*sm:block/);
    // Phone: topic + time sit under the title and hide from 640px up.
    expect(html).toMatch(/class="story-meta-phone[^"]*sm:hidden/);
    // Score column is upvote-only: one control, no down arrow.
    const score = html.split('class="story-score')[1] ?? "";
    expect(score.match(/aria-label="Sign in to vote"/g)).toHaveLength(1);
    expect(score).not.toContain("chevron-down");
  });

  it("bands only the top 3 rows", () => {
    const html = renderToStaticMarkup(<DaySection day={rows(5)} lang="en" />);
    expect(html.match(/story-row-top/g)).toHaveLength(3);
  });

  it("shortens the Vietnamese time to '7 giờ'", () => {
    const now = Math.floor(Date.now() / 1000);
    const html = renderToStaticMarkup(
      <DaySection
        day={{
          ...day,
          items: [{ ...item, published_at: now - 7 * 3600 - 60 }],
        }}
        lang="vi"
      />
    );
    expect(html).toContain("7 giờ<");
    expect(html).not.toContain("giờ trước");
  });
});
