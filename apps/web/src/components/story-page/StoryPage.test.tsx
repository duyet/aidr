/**
 * The story permalink reads as a news page whose main text is the AI;DR.
 * These render checks hold the owner's asks: the summary shows once, in the
 * page language and marked with the language it is really in; bilingual
 * mode shows both languages from their own columns; the actions, sources,
 * one "ranked high" line and the end card sit in the redesign's order; and
 * the page keeps exactly one h1.
 *
 * Server-rendered, like the other story markup tests: happy-dom is the Vite
 * client graph and cannot import the story's server functions.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { countHeadings, headingTexts } from "../../lib/article-headings";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../../lib/prefs";
import type { FeedItem, Lang } from "../../lib/types";
import { StoryPage } from "./StoryPage";

const item: FeedItem = {
  id: "affa220c0123456789abcdef01234567",
  url: "https://www.wsj.com/tech/openai-raise",
  title: "OpenAI has secured about $11B of a new round",
  title_vi: "OpenAI mới gom được ~11 tỷ USD cho vòng gọi vốn mới",
  summary: "OpenAI secured about $11B.\n\nThe round values it at $1.25T.",
  summary_vi:
    "OpenAI đã bảo đảm khoảng 11 tỷ USD.\n\nVòng này định giá 1,25 nghìn tỷ USD.",
  category: "Funding",
  published_at: Math.floor(Date.parse("2026-10-31T02:30:00Z") / 1000),
  points: 0,
  comments: 0,
  rank_score: 9.2,
  source_id: "techmeme",
  tags: ["openai", "funding"],
  sources: [
    {
      kind: "source",
      author: "Berber Jin",
      posted_at: null,
      quote: null,
      url: "https://www.wsj.com/tech/openai-raise",
    },
    {
      kind: "source",
      author: "Techmeme",
      posted_at: null,
      quote: null,
      url: "https://x.com/Techmeme/status/1",
    },
    {
      kind: "discussion",
      author: "zerohedge",
      posted_at: 1_793_000_000,
      quote: "Less than half",
      url: "https://x.com/zerohedge/status/2",
    },
  ],
  llm_tokens: 1200,
  image_url: null,
};

function render(
  story: FeedItem,
  lang: Lang,
  prefs: Partial<Prefs> = {}
): string {
  return renderToStaticMarkup(
    <PrefsContext.Provider
      value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}
    >
      <StoryPage item={story} lang={lang} />
    </PrefsContext.Provider>
  );
}

/** Occurrences of `needle` in the page's visible text (tags removed). */
function count(html: string, needle: string): number {
  return html.replace(/<[^>]+>/g, "").split(needle).length - 1;
}

const keyword = (word: string) =>
  new RegExp(`class="topic-ink font-semibold" style="[^"]*">${word}</span>`);

describe("story page", () => {
  it("shows the Vietnamese AI;DR once, marked vi, with highlights", () => {
    const html = render(item, "vi");
    expect(count(html, "OpenAI đã bảo đảm khoảng ")).toBe(1);
    expect(count(html, "Vòng này định giá ")).toBe(1);
    expect(html).not.toContain("OpenAI secured about");
    expect(html).toMatch(/data-suggest-field="summary" lang="vi"/);
    expect(html).toMatch(keyword("11 tỷ USD"));
    expect(html).toMatch(keyword("1,25 nghìn tỷ USD"));
  });

  it("falls back to the English summary on the VI page, marked en", () => {
    const html = render({ ...item, summary_vi: null }, "vi");
    expect(count(html, "OpenAI secured about ")).toBe(1);
    expect(html).toMatch(/data-suggest-field="summary" lang="en"/);
  });

  it("keeps one h1: the localized title with its keywords", () => {
    const html = render(item, "vi");
    expect(countHeadings(html, "h1")).toBe(1);
    expect(headingTexts(html, "h1")).toEqual([
      "OpenAI mới gom được ~11 tỷ USD cho vòng gọi vốn mới",
    ]);
    expect(html).toMatch(keyword("OpenAI"));
    expect(html).toMatch(keyword("~11 tỷ USD"));
  });

  it("marks an English title on the VI page as en", () => {
    const html = render({ ...item, title_vi: null }, "vi");
    expect(html).toMatch(/<h1[^>]*lang="en"/);
  });

  it("lists main sources as chips and the rest behind + N more", () => {
    const html = render(item, "en");
    expect(html).toMatch(/<h2[^>]*class="sr-only"[^>]*>.*Sources/);
    expect(html).toContain(">Berber Jin</a>");
    expect(html).toContain(">@Techmeme</a>");
    expect(html).toContain("+ 1 more</span></summary>");
    expect(html).toContain("Less than half");
    expect(html).toContain('id="sources"');
  });

  it("offers the source as the primary action, with copy and share as links", () => {
    const html = render(item, "vi");
    expect(html).toMatch(
      /<a[^>]*href="https:\/\/www\.wsj\.com\/tech\/openai-raise"[^>]*class="btn-primary"[^>]*>.*Đọc bài gốc/
    );
    expect(html).toMatch(/class="btn-link"[^>]*>.*Chép bản tóm tắt/);
    expect(html).toMatch(/class="btn-link"[^>]*>.*Chia sẻ/);
    expect(html).not.toContain("data-story-dock");
  });

  it("keeps the story tools reachable", () => {
    const html = render(item, "en");
    expect(html).toContain("#openai");
    expect(html).toContain("/api/story/affa220c.md");
    expect(html).toContain("Shortcuts");
  });

  it("shows no score, token detail or ranked-because line", () => {
    const html = render(item, "en");
    expect(html).not.toContain("Ranked high because");
    expect(render(item, "vi")).not.toContain("Xếp cao vì");
    expect(html).not.toContain("Why this ranks");
    expect(html).not.toContain("Score 9.2");
    expect(html).not.toContain("tokens");
  });

  it("counts outlets once in the eyebrow, discussion threads left out", () => {
    const html = render(item, "en");
    expect(html).toContain("2 sources</span>");
    expect(html).not.toContain("because 2 outlets");
  });

  it("hides the ranked line for a single outlet and says '1 source'", () => {
    const one = { ...item, sources: item.sources.slice(0, 1) };
    const html = render(one, "en");
    expect(html).toContain("1 source</span>");
    expect(html).not.toContain("Ranked high");
  });

  it("names the Vietnam day in the eyebrow and links its archive", () => {
    const html = render(item, "vi");
    expect(html).toContain('href="/date/2026-10-31?lang=vi"');
    expect(html).toContain(">31.10.2026</a>");
    expect(html).toContain("09:30");
  });

  it("bylines the source in the page language", () => {
    expect(render(item, "vi")).toContain("Từ Berber Jin · wsj.com");
    expect(render(item, "en")).toContain("By Berber Jin · wsj.com");
  });

  it("orders the single column the way the phone reads it", () => {
    const html = render(
      { ...item, image_url: "https://example.com/hero.jpg" },
      "en"
    );
    const at = (needle: string) => html.indexOf(needle);
    const order = [
      "<h1",
      "<figure",
      'data-testid="story-aidr"',
      'class="btn-primary"',
      'data-testid="story-end"',
    ].map(at);
    expect(order.every((n) => n > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("ends with the email field and the Telegram channel of the page language", () => {
    const vi = render(item, "vi");
    expect(vi).toContain("Bản tin mỗi sáng");
    expect(vi).toMatch(/<form[\s\S]*type="email"/);
    expect(vi).toContain('href="https://t.me/aihomnay"');
    expect(vi).toContain("Telegram @aihomnay");
    const en = render(item, "en");
    expect(en).toContain('href="https://t.me/aidr_today"');
    expect(en).toContain("Telegram @aidr_today");
  });

  it("follows the leading language for Telegram in bilingual mode", () => {
    const html = render(item, "vi", { bilingual: true, bilingualFirst: "en" });
    expect(html).toContain('href="https://t.me/aidr_today"');
  });

  it("pins nothing over the top block: no fixed or sticky element before the AI;DR", () => {
    const html = render(item, "en");
    const top = html.slice(0, html.indexOf('data-testid="story-aidr"'));
    expect(top).not.toMatch(/\b(fixed|sticky)\b/);
  });

  it("adds the drop cap to the first paragraph and justifies the AI;DR", () => {
    const html = render(item, "en");
    expect(html).toContain('class="np-justify');
    expect(html.match(/class="drop-cap"/g)).toHaveLength(1);
    expect(html).toMatch(/<p class="drop-cap">.*OpenAI/);
  });
});

describe("story page, bilingual mode", () => {
  const bi = { bilingual: true } as const;

  it("shows both headlines in one h1, the leading language first, from their own columns", () => {
    const html = render(item, "en", { ...bi, bilingualFirst: "vi" });
    expect(countHeadings(html, "h1")).toBe(1);
    const text = headingTexts(html, "h1")[0] ?? "";
    expect(text.indexOf("OpenAI mới gom được")).toBeGreaterThan(-1);
    expect(text.indexOf("OpenAI mới gom được")).toBeLessThan(
      text.indexOf("OpenAI has secured")
    );
    expect(html).toMatch(/<span lang="en" class="bi-second/);
  });

  it("stacks the two summaries, the other language muted and not dropped-cap", () => {
    const html = render(item, "vi", { ...bi, bilingualFirst: "en" });
    expect(count(html, "OpenAI secured about ")).toBe(1);
    expect(count(html, "OpenAI đã bảo đảm khoảng ")).toBe(1);
    const text = html.replace(/<[^>]+>/g, "");
    expect(text.indexOf("OpenAI secured about")).toBeLessThan(
      text.indexOf("OpenAI đã bảo đảm")
    );
    expect(html).toMatch(/lang="vi" class="[^"]*bi-second/);
    expect(html.match(/class="drop-cap"/g)).toHaveLength(1);
  });

  it("targets suggestions at the Vietnamese column only", () => {
    const html = render(item, "vi", { ...bi, bilingualFirst: "en" });
    expect(html.match(/data-suggest-field="summary"/g)).toHaveLength(1);
    expect(html).toMatch(/data-suggest-field="summary" lang="vi"/);
  });

  it("never fills a missing Vietnamese summary from English", () => {
    const html = render({ ...item, summary_vi: null }, "vi", bi);
    expect(count(html, "OpenAI secured about ")).toBe(1);
    expect(html).not.toContain('bi-second"><p');
    expect(html.match(/class="drop-cap"/g)).toHaveLength(1);
  });

  it("shows the byline and labels in both languages", () => {
    const html = render(item, "vi", { ...bi, bilingualFirst: "vi" });
    expect(html).toContain("Từ Berber Jin · wsj.com");
    expect(html).toContain("By Berber Jin · wsj.com");
    expect(html).toContain("Đọc bài gốc");
    expect(html).toContain("Read the source");
  });
});
