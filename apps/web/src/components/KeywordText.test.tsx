import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeywordText } from "./KeywordText";

const text = "OpenAI raised $11B for models";

describe("KeywordText", () => {
  it("keeps the kw-num and kw-entity spans by default", () => {
    const html = renderToStaticMarkup(
      <KeywordText text={text} tags={["OpenAI"]} />
    );
    expect(html).toContain('<span class="kw-entity">OpenAI</span>');
    expect(html).toContain('<span class="kw-num">$11B</span>');
    expect(html).not.toContain("topic-ink");
  });

  it("paints every key word with the topic ink in the story's topic color", () => {
    const html = renderToStaticMarkup(
      <KeywordText text={text} tags={["OpenAI"]} ink category="Funding" />
    );
    expect(html).toMatch(/class="topic-ink font-semibold"[^>]*>OpenAI</);
    expect(html).toMatch(/class="topic-ink font-semibold"[^>]*>\$11B</);
    expect(html).toContain("--tc-light:");
    expect(html).not.toContain("kw-");
    expect(html).toContain("<span> raised </span>");
  });

  it("falls back to the neutral pair for a story with no category", () => {
    const html = renderToStaticMarkup(
      <KeywordText text={text} tags={["OpenAI"]} ink category={null} />
    );
    expect(html).toContain("topic-ink");
    expect(html).toContain("--tc-light:");
  });
});
