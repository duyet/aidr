/**
 * A summary's `lang` is the language of the text on screen. A Vietnamese
 * summary with no title_vi is still Vietnamese, and an English column or
 * English fallback must not inherit the page language.
 *
 * Server-rendered, like the other story markup tests. happy-dom is the Vite
 * client graph and cannot import the story detail's server function.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FeedItem } from "../../lib/types";
import { StoryDetail } from "../StoryDetail";
import { BilingualSummary } from "./BilingualSummary";

const item: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://www.example.com/post",
  title: "A faster model",
  title_vi: null,
  summary: "English summary.",
  summary_vi: "Bản tiếng Việt.",
  category: null,
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

/** The column's own `lang` is the last one opened before its paragraph. */
function langOf(html: string, text: string): string | null {
  const at = html.indexOf(`<p>${text}</p>`);
  if (at < 0) return null;
  const langs = [...html.slice(0, at).matchAll(/\slang="([^"]*)"/g)];
  return langs.at(-1)?.[1] ?? null;
}

describe("summary language", () => {
  it("marks Vietnamese summary text as vi even when title_vi is missing", () => {
    const html = renderToStaticMarkup(
      <BilingualSummary
        lang="vi"
        paragraphsEn={["English summary."]}
        paragraphsVi={["Bản tiếng Việt."]}
      />
    );
    expect(langOf(html, "Bản tiếng Việt.")).toBe("vi");
    expect(langOf(html, "English summary.")).toBe("en");
  });

  it("marks the English column as en on an English page", () => {
    const html = renderToStaticMarkup(
      <BilingualSummary
        lang="en"
        paragraphsEn={["English summary."]}
        paragraphsVi={["Bản tiếng Việt."]}
      />
    );
    expect(langOf(html, "English summary.")).toBe("en");
    expect(langOf(html, "Bản tiếng Việt.")).toBe("vi");
  });

  it("marks a Vietnamese story summary as vi", () => {
    const html = renderToStaticMarkup(<StoryDetail item={item} lang="vi" />);
    expect(langOf(html, "Bản tiếng Việt.")).toBe("vi");
  });

  it("marks the English fallback summary as en when summary_vi is missing", () => {
    const html = renderToStaticMarkup(
      <StoryDetail item={{ ...item, summary_vi: null }} lang="vi" />
    );
    expect(langOf(html, "English summary.")).toBe("en");
  });
});
