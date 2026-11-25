import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LangContext } from "../lib/lang-context";
import { DEFAULT_PREFS, PrefsContext } from "../lib/prefs";
import type { DayGroup, FeedItem } from "../lib/types";
import { DaySection } from "./DaySection";
import { anyVotes } from "./StoryRow";

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

const votesOn = (el: ReactElement) => (
  <PrefsContext.Provider
    value={{ prefs: { ...DEFAULT_PREFS, votes: true }, setPrefs: () => {} }}
  >
    {el}
  </PrefsContext.Provider>
);

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
  const inLang = (lang: "vi" | "en", node: ReactElement) =>
    renderToStaticMarkup(
      <LangContext.Provider value={lang}>{node}</LangContext.Provider>
    );

  it("renders only `limit` rows and a bilingual Load more with the rest", () => {
    const vi = inLang("vi", <DaySection day={many(35)} lang="vi" limit={30} />);
    expect(vi.match(/id="item-/g)).toHaveLength(30);
    expect(vi).toContain("Xem thêm (5)");
    const en = inLang("en", <DaySection day={many(35)} lang="en" limit={30} />);
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

describe("ranked list rows", () => {
  const rows = (n: number): DayGroup => ({
    ...day,
    items: Array.from({ length: n }, (_, i) => ({
      ...item,
      id: `abcdef12deadbe${String(i).padStart(2, "0")}`,
    })),
  });

  it("has no legend row and no lines between rows", () => {
    const html = renderToStaticMarkup(<DaySection day={rows(3)} lang="en" />);
    expect(html).not.toContain("story-legend");
    expect(html).not.toMatch(/divide-y|border-b|border-t/);
  });

  it("lays the list out for the newspaper columns", () => {
    const html = renderToStaticMarkup(<DaySection day={rows(3)} lang="en" />);
    expect(html).toContain('class="np-columns"');
  });

  it("numbers rows from firstRank, under a label that replaces the date heading", () => {
    const html = renderToStaticMarkup(
      <DaySection day={rows(2)} lang="en" firstRank={2} label="Ranked today" />
    );
    expect(html).toMatch(/<h3[^>]*>Ranked today<\/h3>/);
    expect(html).not.toContain("<h2");
    const ranks = [
      ...html.matchAll(/story-rank[^>]*>(?:<svg.*?<\/svg>)?(\d+)</g),
    ];
    expect(ranks.map((m) => m[1])).toEqual(["2", "3"]);
  });

  it("marks only the top 3 rows (their rank takes the accent)", () => {
    const html = renderToStaticMarkup(<DaySection day={rows(5)} lang="en" />);
    expect(html.match(/story-row-top/g)).toHaveLength(3);
  });

  it("gives the day's first row the top-story icon, unless a lead story took rank 1", () => {
    const first = renderToStaticMarkup(<DaySection day={rows(3)} lang="en" />);
    expect(first.match(/aria-label="Top story today"/g)).toHaveLength(1);
    const afterLead = renderToStaticMarkup(
      <DaySection day={rows(3)} lang="en" firstRank={2} />
    );
    expect(afterLead).not.toContain("Top story today");
  });

  it("hides the vote column while every count is zero", () => {
    const html = renderToStaticMarkup(<DaySection day={rows(3)} lang="en" />);
    expect(html).not.toContain("story-score");
    expect(html).not.toContain("Upvote");
  });

  it("shows the vote column once any story has a vote", () => {
    const voted = rows(3);
    voted.items[1] = { ...voted.items[1], vote_net: 4 };
    const html = renderToStaticMarkup(
      votesOn(<DaySection day={voted} lang="en" />)
    );
    expect(html.match(/story-score/g)).toHaveLength(3);
    expect(html.match(/aria-label="Upvote"/g)).toHaveLength(3);
  });

  it("takes the page's say over its own day for the vote column", () => {
    const voted = rows(2);
    voted.items[0] = { ...voted.items[0], vote_net: 2 };
    const html = renderToStaticMarkup(
      votesOn(<DaySection day={rows(2)} lang="en" showVotes />)
    );
    expect(html.match(/story-score/g)).toHaveLength(2);
    expect(
      renderToStaticMarkup(
        votesOn(<DaySection day={voted} lang="en" showVotes={false} />)
      )
    ).not.toContain("story-score");
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

  it("shortens the English time to '7h' to match", () => {
    const now = Math.floor(Date.now() / 1000);
    const html = renderToStaticMarkup(
      <DaySection
        day={{
          ...day,
          items: [{ ...item, published_at: now - 7 * 3600 - 60 }],
        }}
        lang="en"
      />
    );
    expect(html).toContain(">7h<");
    expect(html).not.toContain("h ago");
  });
});

describe("anyVotes", () => {
  it("is false for zero, missing and negative counts, true for a positive one", () => {
    expect(anyVotes([{ vote_net: 0 }, {}, { vote_net: -1 }])).toBe(false);
    expect(anyVotes([{ vote_net: 0 }, { vote_net: 1 }])).toBe(true);
    expect(anyVotes([])).toBe(false);
  });
});
