import { describe, expect, it } from "vitest";
import {
  PAGE_MARKDOWN_PATHS,
  pageMarkdown,
  pageMarkdownResponse,
  rankedEditionLine,
} from "./page-markdown";
import { SITE_URL } from "./site";

describe("page markdown", () => {
  it("describes the ranked edition and links the HTML page", () => {
    const body = pageMarkdown("/about.md");
    expect(body).toContain(rankedEditionLine());
    expect(body).toContain(`${SITE_URL}/about`);
    expect(pageMarkdown("/nope.md")).toBeNull();
  });

  it("points each twin at its HTML page as the canonical", () => {
    expect(pageMarkdownResponse("/about.md")?.headers.get("link")).toBe(
      `<${SITE_URL}/about>; rel="canonical"`
    );
    expect(pageMarkdownResponse("/subscribe.md")?.headers.get("link")).toBe(
      `<${SITE_URL}/subscribe?lang=en>; rel="canonical"`
    );
    for (const path of PAGE_MARKDOWN_PATHS) {
      expect(pageMarkdownResponse(path)?.headers.get("link"), path).toMatch(
        /^<https:\/\/aidr\.today\/[a-z]+(\?lang=en)?>; rel="canonical"$/
      );
    }
  });
});
