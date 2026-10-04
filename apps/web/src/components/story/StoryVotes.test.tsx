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
    expect(html).not.toContain("castStoryVote");
  });

  it("keeps the sign-in path on the compact feed control", () => {
    const html = renderToStaticMarkup(
      <StoryVotes itemId={ITEM} voteNet={-2} lang="vi" compact />
    );
    expect(html).toContain(">-2<");
    expect(html).toContain('href="/sign-in?lang=vi"');
    expect(html).toContain("Đăng nhập để bình chọn");
  });
});
