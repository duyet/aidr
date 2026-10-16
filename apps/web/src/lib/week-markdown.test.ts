import { describe, expect, it } from "vitest";
import { weekStoryHeadline } from "../components/WeeklyPaper";
import type { FeedItem } from "./types";
import {
  handleWeekMarkdownRequest,
  isWeekMarkdownPath,
  renderWeekMarkdown,
} from "./week-markdown";
import { isWeekEmptyIn, type WeekEdition } from "./week-model";
import { weekApiBody } from "./week-queries";

/**
 * The weekly Markdown and page are generated from model and publisher text,
 * in one language each. These tests fail if that text can break out of the
 * Markdown, or if a Vietnamese reader is shown the English edition.
 */

function item(over: Partial<FeedItem>): FeedItem {
  return {
    id: "abcdef0123456789",
    url: "https://example.com/a",
    title: "Alpha",
    title_vi: null,
    summary: null,
    summary_vi: null,
    category: "Models",
    published_at: 0,
    points: 0,
    comments: 0,
    rank_score: 1,
    source_id: "hn",
    tags: [],
    sources: [],
    llm_tokens: 0,
    image_url: null,
    ...over,
  };
}

const edition: WeekEdition = {
  week: "2026-W41",
  issue: 2,
  start_date: "2026-10-05",
  end_date: "2026-10-11",
  intro_en: "A [link](javascript:x) # heading week",
  intro_vi: null,
  stories: [
    {
      rank: 1,
      item: item({ title: "Alpha *bold*", title_vi: "Alpha tiếng Việt" }),
      text_en: "Alpha shipped.",
      text_vi: "Alpha ra mắt.",
    },
    {
      rank: 2,
      item: item({ id: "1111111111111111", title: "Beta" }),
      text_en: "Beta raised.",
      text_vi: null,
    },
  ],
  prevWeek: "2026-W40",
  nextWeek: null,
  updated_at: 1,
};

describe("week Markdown", () => {
  it("matches only /week/<key>.md", () => {
    expect(isWeekMarkdownPath("/week/2026-W41.md")).toBe(true);
    expect(isWeekMarkdownPath("/week/2026-W41")).toBe(false);
  });

  it("escapes model and publisher text", () => {
    const md = renderWeekMarkdown(edition, "en");
    expect(md).toContain("A \\[link\\](javascript:x) \\# heading week");
    expect(md).toContain("[Alpha \\*bold\\*]");
    expect(md).toContain("https://aidr.today/date/2026-10-05?lang=en");
  });

  it("prints only Vietnamese stories in VI, never the English line", () => {
    const md = renderWeekMarkdown(edition, "vi");
    expect(md).toContain("Alpha tiếng Việt");
    expect(md).not.toContain("Beta");
    expect(md).not.toContain("heading week");
  });

  it("404s a language that has no stories instead of printing the other", async () => {
    const enOnly: WeekEdition = {
      ...edition,
      stories: edition.stories.map((s) => ({ ...s, text_vi: null })),
    };
    expect(isWeekEmptyIn(enOnly, "vi")).toBe(true);
    expect(isWeekEmptyIn(enOnly, "en")).toBe(false);
    const db = {
      batch: async () => [
        {
          results: [
            {
              week: "2026-W41",
              issue: 2,
              start_date: "2026-10-05",
              end_date: "2026-10-11",
              item_ids: '["abcdef0123456789"]',
              intro_en: "x",
              intro_vi: null,
              stories_en: '[{"item_id":"abcdef0123456789","text":"Alpha."}]',
              stories_vi: "[]",
              updated_at: 1,
            },
          ],
        },
        { results: [] },
        { results: [] },
      ],
      prepare: () => ({
        bind: () => ({ all: async () => ({ results: [] }) }),
        all: async () => ({ results: [] }),
      }),
    } as unknown as D1Database;
    const res = await handleWeekMarkdownRequest(
      new Request("https://aidr.today/week/2026-W41.md?lang=vi"),
      db,
      Date.parse("2026-10-12T03:00:00Z")
    );
    expect(res.status).toBe(404);
  });

  // A D1 blip on a real week must not tell crawlers the URL is gone (#892).
  it("500s, uncached, when the D1 read fails", async () => {
    const db = {
      batch: async () => {
        throw new Error("D1_ERROR: Network connection lost.");
      },
      prepare: () => ({ bind: () => ({}) }),
    } as unknown as D1Database;
    const res = await handleWeekMarkdownRequest(
      new Request("https://aidr.today/week/2026-W41.md?lang=en"),
      db,
      Date.parse("2026-10-12T03:00:00Z")
    );
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("404s a closed week that has no edition", async () => {
    const db = {
      batch: async () => [{ results: [] }, { results: [] }, { results: [] }],
      prepare: () => ({ bind: () => ({}) }),
    } as unknown as D1Database;
    const res = await handleWeekMarkdownRequest(
      new Request("https://aidr.today/week/2026-W41.md?lang=en"),
      db,
      Date.parse("2026-10-12T03:00:00Z")
    );
    expect(res.status).toBe(404);
  });

  it("404s the week that is still open", async () => {
    const res = await handleWeekMarkdownRequest(
      new Request("https://aidr.today/week/2026-W42.md?lang=en"),
      undefined,
      Date.parse("2026-10-12T03:00:00Z")
    );
    expect(res.status).toBe(404);
  });
});

describe("week page headline", () => {
  it("uses the line itself in VI when there is no title_vi, never the English title", () => {
    const story = {
      rank: 1,
      item: item({ title: "English title", title_vi: null }),
      text_en: "English line.",
      text_vi: "Dòng tiếng Việt.",
    };
    expect(weekStoryHeadline(story, "vi")).toEqual({
      headline: "Dòng tiếng Việt.",
      deck: null,
    });
    expect(weekStoryHeadline(story, "en")).toEqual({
      headline: "English title",
      deck: "English line.",
    });
  });
});

describe("week API body", () => {
  it("keeps both languages in separate fields for the video script", () => {
    const body = weekApiBody(edition, (i) => `/${i.id.slice(0, 8)}`);
    expect(body.intro_vi).toBe("");
    expect(body.stories[1]).toMatchObject({
      rank: 2,
      text_en: "Beta raised.",
      text_vi: null,
      title_vi: null,
      source: "example.com",
      path: "/11111111",
    });
  });
});
