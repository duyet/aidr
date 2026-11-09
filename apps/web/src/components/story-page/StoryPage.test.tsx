/**
 * The story permalink reads as a news page whose main text is the AI;DR.
 * These render checks hold the owner's asks: the summary shows once (no
 * second box repeating it), in the page language and marked with the
 * language it is really in, the sources sit on one line with the rest
 * behind "+ N more" inside the quiet footer cluster at the very bottom
 * (Read Next comes before it), the copy-for-social button renders once,
 * and the page keeps exactly one h1.
 *
 * Server-rendered, like the other story markup tests: happy-dom is the Vite
 * client graph and cannot import the story's server functions.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { countHeadings, headingTexts } from "../../lib/article-headings";
import type { FeedItem, Lang } from "../../lib/types";
import { StoryPage } from "./StoryPage";

// The real ReadNext hydrates its rows client-side and renders null on the
// server; the stub marks its position in the markup so the order can be
// asserted.
vi.mock("./ReadNext", () => ({
  ReadNext: () => <section data-testid="read-next" />,
}));

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

function render(story: FeedItem, lang: Lang): string {
  return renderToStaticMarkup(<StoryPage item={story} lang={lang} />);
}

/** Occurrences of `needle` in the page's visible text (tags removed). */
function count(html: string, needle: string): number {
  return html.replace(/<[^>]+>/g, "").split(needle).length - 1;
}

describe("story page", () => {
  it("shows the Vietnamese AI;DR once, marked vi, with highlights", () => {
    const html = render(item, "vi");
    expect(count(html, "OpenAI đã bảo đảm khoảng ")).toBe(1);
    expect(count(html, "Vòng này định giá ")).toBe(1);
    expect(html).not.toContain("OpenAI secured about");
    expect(html).toMatch(/data-suggest-field="summary" lang="vi"/);
    expect(html).toContain('<span class="kw-num">11 tỷ USD</span>');
    expect(html).toContain('<span class="kw-num">1,25 nghìn tỷ USD</span>');
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
    expect(html).toContain('<span class="kw-entity">OpenAI</span>');
    expect(html).toContain('<span class="kw-num">~11 tỷ USD</span>');
  });

  it("marks an English title on the VI page as en", () => {
    const html = render({ ...item, title_vi: null }, "vi");
    expect(html).toMatch(/<h1[^>]*lang="en"/);
  });

  it("lists main sources on one line and the rest behind + N more", () => {
    const html = render(item, "en");
    expect(html).toContain(">Sources</h2>");
    expect(html).toContain(">Berber Jin</a>");
    expect(html).toContain(">@Techmeme</a>");
    expect(html).toContain("+ 1 more</summary>");
    expect(html).toContain("Less than half");
  });

  it("offers copy for social and the original article, once each", () => {
    const html = render(item, "vi");
    // One desktop copy button in the actions row; the phone dock carries
    // the short form. No copy button inside the AI;DR module.
    expect(html.match(/Chép AI;DR để đăng/g)?.length).toBe(1);
    expect(html.match(/Chép để đăng/g)?.length).toBe(1);
    expect(html).toContain("Đọc bài gốc");
    expect(html).toContain('href="https://www.wsj.com/tech/openai-raise"');
    const aidr =
      /<section[^>]*data-testid="story-aidr"[\s\S]*?<\/section>/.exec(
        html
      )?.[0];
    expect(aidr).toBeTruthy();
    expect(aidr).not.toContain("Chép");
  });

  it("closes with Read Next, then the quiet footer cluster", () => {
    const html = render(item, "en");
    const readNext = html.indexOf('data-testid="read-next"');
    const sources = html.indexOf(">Sources</h2>");
    const tags = html.indexOf("#openai");
    const why = html.indexOf("Why this ranks");
    expect(readNext).toBeGreaterThan(-1);
    expect(sources).toBeGreaterThan(readNext);
    expect(tags).toBeGreaterThan(sources);
    expect(why).toBeGreaterThan(sources);
  });

  it("keeps the story tools reachable", () => {
    const html = render(item, "en");
    expect(html).toContain("#openai");
    expect(html).toContain("/api/story/affa220c.md");
    expect(html).toContain("Why this ranks");
    expect(html).toContain("Score 9.2");
  });

  it("names the Vietnam day in the eyebrow and links its archive", () => {
    const html = render(item, "vi");
    expect(html).toContain('href="/date/2026-10-31?lang=vi"');
    expect(html).toContain(">31.10.2026</a>");
    expect(html).toContain("09:30");
  });
});
