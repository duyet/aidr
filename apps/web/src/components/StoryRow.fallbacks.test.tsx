/**
 * Story page fallbacks (#139): a story with no source link, no image or no
 * timestamp must render a usable page. Rendered with React's server renderer
 * so a pass means the markup is in the SSR HTML.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FeedItem } from "../lib/types";
import { StoryDetail } from "./StoryDetail";
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

describe("content history", () => {
  const logged = {
    ...item,
    content_log: [
      {
        field: "title" as const,
        lang: "en",
        before_text: "Old title",
        after_text: "New title",
        reason: "ingest",
        created_at: 1_700_000_000,
      },
      {
        field: "summary" as const,
        lang: "vi",
        before_text: "Cũ",
        after_text: "Mới",
        reason: "backfill",
        created_at: 1_699_000_000,
      },
    ],
  };

  it("renders the loaded log, with each language, and does not call the story a first insert", () => {
    const html = renderToStaticMarkup(<StoryDetail item={logged} lang="en" />);
    expect(html).toContain("Content history");
    expect(html).toContain(">en<");
    expect(html).toContain(">vi<");
    expect(html).toContain("Rewritten on ingest");
    expect(html).toContain("Replaced stored text");
    expect(html).not.toContain("When the story was added");
    expect(html).not.toContain("Added translation");
    const vi = renderToStaticMarkup(<StoryDetail item={logged} lang="vi" />);
    expect(vi).toContain("Viết lại khi thu tin");
    expect(vi).toContain("Thay nội dung đã lưu");
    expect(vi).not.toContain("Khi đăng tin");
    expect(vi).not.toContain("Bản dịch bổ sung");
  });

  it("renders nothing when the story has no content log", () => {
    const html = renderToStaticMarkup(
      <StoryDetail item={{ ...item, content_log: undefined }} lang="en" />
    );
    expect(html).not.toContain("Content history");
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
