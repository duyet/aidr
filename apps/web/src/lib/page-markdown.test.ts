import { describe, expect, it } from "vitest";
import {
  PAGE_MARKDOWN_PATHS,
  pageMarkdown,
  rankedEditionLine,
} from "./page-markdown";
import { SITE_URL } from "./site";
import { staticSitemapUrls } from "./sitemap";

describe("page markdown", () => {
  it("describes the ranked edition and links the HTML page", () => {
    const body = pageMarkdown("/about.md");
    expect(body).toContain(rankedEditionLine());
    expect(body).toContain(`${SITE_URL}/about`);
    expect(pageMarkdown("/nope.md")).toBeNull();
  });

  it("lists every markdown twin in the static sitemap", () => {
    const locs = new Set(staticSitemapUrls().map((entry) => entry.loc));
    for (const path of PAGE_MARKDOWN_PATHS) {
      expect(locs.has(`${SITE_URL}${path}`)).toBe(true);
    }
  });
});
