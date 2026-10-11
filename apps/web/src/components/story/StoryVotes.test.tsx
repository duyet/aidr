import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoryVotes } from "./StoryVotes";

const ITEM = "abcdef12deadbeef";

describe("StoryVotes", () => {
  it("shows the net and a sign-in path, and does not post a vote", () => {
    const html = renderToStaticMarkup(
      <StoryVotes itemId={ITEM} voteNet={4} lang="en" />
    );
    expect(html).toContain(">4<");
    expect(html).toContain('href="/sign-in?lang=en"');
    expect(html).toContain("Sign in to vote");
    expect(html).toContain("Was this useful?");
    expect(html).toContain("lucide-thumbs-up");
    expect(html).not.toContain("castStoryVote");
  });

  it("keeps the sign-in path on the compact feed control", () => {
    const html = renderToStaticMarkup(
      <StoryVotes itemId={ITEM} voteNet={-2} lang="vi" compact />
    );
    expect(html).toContain(">-2<");
    expect(html).toContain('href="/sign-in?lang=vi"');
    expect(html).toContain("Đăng nhập để bình chọn");
    // The feed row aligns on the text baseline. A 32px hit lifts the chevron
    // above the title, which is the broken up/down mark on the homepage.
    expect(html).not.toContain("size-8");
    expect(html).toContain("h-5 w-3.5");
  });
});

// The dense feed row's Score column shows upvote only; the dialog and the
// expanded details keep up and down.
describe("StoryVotes upOnly", () => {
  it("drops the down arrow and keeps the count", () => {
    const html = renderToStaticMarkup(
      <StoryVotes itemId={ITEM} voteNet={3} lang="en" compact upOnly />
    );
    expect(html).toContain(">3<");
    expect(html).toContain("chevron-up");
    expect(html).not.toContain("chevron-down");
  });

  it("keeps both arrows by default", () => {
    const html = renderToStaticMarkup(
      <StoryVotes itemId={ITEM} voteNet={3} lang="en" compact />
    );
    expect(html).toContain("chevron-down");
  });
});
