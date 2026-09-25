import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FeedItem } from "../../lib/types";
import { StoryMetaAside } from "./StoryMetaAside";
import {
  formatStoryScore,
  formatStoryTimestamp,
  formatStoryTokens,
  nextDisclosureId,
  storyDisclosureLabel,
  storyTokenAriaLabel,
  storyTokenCount,
} from "./story-meta";

describe("story token metadata helpers", () => {
  it("toggles the disclosure without opening two panels", () => {
    expect(nextDisclosureId(null, "story-tokens")).toBe("story-tokens");
    expect(nextDisclosureId("story-tokens", "story-tokens")).toBeNull();
    expect(nextDisclosureId("story-tokens", "other")).toBe("other");
  });

  it("provides localized accessible labels and keeps the exact count", () => {
    expect(storyTokenAriaLabel("en", false, 787)).toBe(
      "Show token details · 787 tokens"
    );
    expect(storyTokenAriaLabel("vi", true, 787)).toBe(
      "Ẩn chi tiết token · 787 token"
    );
    expect(storyDisclosureLabel("en", true)).toBe("Hide token details");
  });

  it("keeps missing and invalid story metrics honest", () => {
    expect(storyTokenCount(undefined)).toBeNull();
    expect(storyTokenCount(Number.NaN)).toBeNull();
    expect(storyTokenCount(-1)).toBeNull();
    expect(formatStoryTokens(null)).toBe("—");
    expect(formatStoryScore(undefined)).toBe("—");
    expect(formatStoryTimestamp(0, "en")).toBe("—");
  });

  it("formats a real token total and UTC publication time", () => {
    expect(formatStoryTokens(1_234)).toBe("1.2k");
    expect(formatStoryScore(20.66)).toBe("20.7");
    const formatted = formatStoryTimestamp(1_700_000_000, "en");
    expect(formatted).toContain("2023");
    expect(formatted).toContain("UTC");
  });

  it("renders the token control as a closed, labeled disclosure", () => {
    const item: FeedItem = {
      id: "abcdef1234567890",
      url: "https://example.com/story",
      title: "A story",
      title_vi: null,
      summary: null,
      summary_vi: null,
      category: null,
      published_at: 1_700_000_000,
      points: 0,
      comments: 0,
      rank_score: 20.6,
      source_id: "marketbrief",
      tags: [],
      sources: [],
      llm_tokens: 787,
      image_url: null,
    };
    const html = renderToStaticMarkup(
      createElement(StoryMetaAside, { item, lang: "en", imageUrl: null })
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Show token details · 787 tokens"');
    expect(html).toContain("787 tokens");
    expect(html).not.toContain("The current story API does not link");
  });
});
