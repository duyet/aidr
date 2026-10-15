/**
 * Week page hreflang. The page 404s in a language with no story lines, so a
 * one-language week must not advertise the other language as its alternate.
 */
import { describe, expect, it } from "vitest";
import type { HeadLink } from "../lib/seo";
import type { FeedItem, Lang } from "../lib/types";
import type { WeekEdition } from "../lib/week-model";
import { Route } from "./week.$week";

const item: FeedItem = {
  id: "aaaaaaaa11111111",
  url: "https://example.com/a",
  title: "A story",
  title_vi: null,
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

function edition(textVi: string | null): WeekEdition {
  return {
    week: "2026-W41",
    issue: 2,
    start_date: "2026-10-05",
    end_date: "2026-10-11",
    intro_en: "The week in AI.",
    intro_vi: textVi ? "Tuần AI." : null,
    stories: [{ rank: 1, item, text_en: "A line.", text_vi: textVi }],
    prevWeek: null,
    nextWeek: null,
    updated_at: 1_791_738_219_644,
  };
}

type HeadFn = (ctx: {
  loaderData: { kind: "week"; edition: WeekEdition };
  match: {
    context: { lang: Lang };
    search: Record<string, string>;
    pathname: string;
    status: string;
  };
}) => { links: HeadLink[] };

function links(data: WeekEdition, lang: Lang): HeadLink[] {
  const head = Route.options.head as unknown as HeadFn;
  return head({
    loaderData: { kind: "week", edition: data },
    match: {
      context: { lang },
      search: { lang },
      pathname: "/week/2026-W41",
      status: "success",
    },
  }).links;
}

const hreflangs = (list: HeadLink[]) =>
  list.filter((link) => link.hrefLang).map((link) => link.hrefLang);

describe("week page hreflang", () => {
  it("pairs both languages when both have stories", () => {
    expect(hreflangs(links(edition("Một dòng."), "en"))).toEqual([
      "vi",
      "en",
      "x-default",
    ]);
  });

  it("advertises no alternate when the other language would 404", () => {
    const head = links(edition(null), "en");
    expect(hreflangs(head)).toEqual([]);
    expect(head.find((link) => link.rel === "canonical")?.href).toBe(
      "https://aidr.today/week/2026-W41?lang=en"
    );
  });
});
