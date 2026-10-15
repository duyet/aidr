import { describe, expect, it } from "vitest";
import {
  negotiableMarkdownPath,
  prefersMarkdown,
  storyMarkdownAliasPath,
  withAcceptVary,
} from "./markdown-negotiation";

const CHROME_NAVIGATION =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";

describe("prefersMarkdown", () => {
  // A browser must never be handed Markdown, and an agent that asks for
  // Markdown first must not be handed 700 KB of HTML.
  it.each([
    [CHROME_NAVIGATION, false],
    ["*/*", false],
    [null, false],
    ["text/*", false],
    ["text/markdown", true],
    ["text/markdown, text/html", true],
    ["text/html, text/markdown", true],
    ["text/markdown;q=0.9, text/html;q=0.8", true],
    ["text/html, text/markdown;q=0.5", false],
    ["text/markdown;q=0", false],
    ["text/markdown;q=0.5, */*;q=0.1", true],
  ])("%s -> %s", (accept, expected) => {
    expect(prefersMarkdown(accept)).toBe(expected);
  });
});

describe("negotiableMarkdownPath", () => {
  it("maps the four page shapes to their Markdown twins", () => {
    expect(negotiableMarkdownPath("/")).toBe("/index.md");
    expect(negotiableMarkdownPath("/0031a3a8")).toBe("/api/story/0031a3a8.md");
    expect(negotiableMarkdownPath("/date/2026-10-15")).toBe(
      "/date/2026-10-15.md"
    );
    expect(negotiableMarkdownPath("/week/2026-W41")).toBe("/week/2026-W41.md");
  });

  it("leaves every other path alone, so its cache never splits on Accept", () => {
    for (const path of [
      "/about",
      "/weeks",
      "/date/x",
      "/api/public",
      "/0031",
    ]) {
      expect(negotiableMarkdownPath(path), path).toBeNull();
    }
  });

  it("aliases /{id}.md to the story Markdown endpoint", () => {
    expect(storyMarkdownAliasPath("/0031a3a8.md")).toBe(
      "/api/story/0031a3a8.md"
    );
    expect(storyMarkdownAliasPath("/about.md")).toBeNull();
  });
});

describe("withAcceptVary", () => {
  it("merges Accept into an existing Vary once", () => {
    const varied = withAcceptVary(
      new Response("x", { headers: { Vary: "Cookie, Accept-Language" } })
    );
    expect(varied.headers.get("Vary")).toBe("Cookie, Accept-Language, Accept");
    expect(withAcceptVary(varied).headers.get("Vary")).toBe(
      "Cookie, Accept-Language, Accept"
    );
    expect(withAcceptVary(new Response("x")).headers.get("Vary")).toBe(
      "Accept"
    );
  });
});
