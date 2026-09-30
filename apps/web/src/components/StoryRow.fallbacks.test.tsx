/**
 * Story page fallbacks (#139): a story with no source link, no image or no
 * timestamp must render a usable page. Rendered with React's server renderer
 * so a pass means the markup is in the SSR HTML.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FeedItem } from "../lib/types";
import { StoryRow } from "./StoryRow";
import { STORY_THUMB_PLACEHOLDER, StoryThumb } from "./StoryThumb";
import { DialogHeader } from "./story-dialog/DialogHeader";

const item: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://www.example.com/post",
  title: "A story",
  title_vi: null,
  summary: "Summary",
  summary_vi: null,
  category: null,
  published_at: 1_700_000_000,
  points: 0,
  comments: 0,
  rank_score: 0,
  source_id: "hn",
  tags: [],
  sources: [],
  llm_tokens: 0,
  image_url: null,
};

const row = (i: FeedItem) =>
  renderToStaticMarkup(<StoryRow item={i} index={1} lang="en" />);

describe("story source link", () => {
  it("links out to the publisher when the URL is valid", () => {
    const html = row(item);
    expect(html).toContain('href="https://www.example.com/post"');
    expect(html).toContain("example.com");
  });

  it("renders no external link at all when the URL failed validation", () => {
    const html = row({ ...item, url: "" });
    // An empty href would reload the current page.
    expect(html).not.toContain('href=""');
    expect(html).not.toContain("Open story link");
    // The title still links to the aidr permalink.
    expect(html).toContain('href="/abcdef12?lang=en"');
  });

  it("dialog header omits the source line for an empty URL", () => {
    const html = renderToStaticMarkup(
      <DialogHeader
        item={{ ...item, url: "" }}
        title="A story"
        fallbackFromEnglish={false}
        hasVi={false}
        bilingual={false}
        lang="en"
        onToggleBilingual={() => {}}
        onClose={() => {}}
      />
    );
    expect(html).not.toContain('href=""');
    expect(html).toContain("A story");
  });
});

describe("story timestamp", () => {
  it("does not print NaN when published_at is missing", () => {
    const html = row({ ...item, published_at: Number.NaN });
    expect(html).not.toContain("NaN");
  });
});

describe("story image", () => {
  it("falls back to the first-party card, never an empty src", () => {
    const html = renderToStaticMarkup(
      <StoryThumb src={null} itemId={item.id} lang="en" />
    );
    expect(html).toContain("/api/og/abcdef12deadbeef.png?lang=en");
    expect(html).not.toContain('src=""');
  });

  it("uses the branded mark when there is neither image nor id", () => {
    const html = renderToStaticMarkup(<StoryThumb src={null} />);
    expect(html).toContain(`src="${STORY_THUMB_PLACEHOLDER}"`);
  });
});
