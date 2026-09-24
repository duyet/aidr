import { describe, expect, it, vi } from "vitest";
import { SITE_URL } from "./site";
import {
  handleStoryMarkdownRequest,
  isStoryMarkdownPath,
  renderStoryMarkdown,
  STORY_MARKDOWN_CACHE_CONTROL,
  STORY_MARKDOWN_SUMMARY_MAX_CHARS,
} from "./story-markdown";
import type { FeedItem, ItemSource } from "./types";

function story(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "abcdef1234567890",
    url: "https://example.com/story",
    title: "A safe *title*",
    title_vi: null,
    summary: "A short summary.",
    summary_vi: null,
    category: "Research",
    published_at: 1_772_000_000,
    points: 12,
    comments: 3,
    rank_score: 4.2,
    source_id: "test",
    tags: ["AI", "agents"],
    sources: [
      {
        kind: "source",
        author: "Example",
        posted_at: null,
        quote: null,
        url: "https://example.com/story",
      },
    ],
    llm_tokens: 0,
    image_url: null,
    ...overrides,
  };
}

function sourceRows(sources: ItemSource[]): Record<string, unknown>[] {
  return sources.map((source) => ({
    item_id: "abcdef1234567890",
    ...source,
  }));
}

function fakeDb(item: FeedItem | null): D1Database {
  const row = item
    ? {
        id: item.id,
        url: item.url,
        title: item.title,
        title_vi: item.title_vi,
        summary: item.summary,
        summary_vi: item.summary_vi,
        category: item.category,
        published_at: item.published_at,
        points: item.points,
        comments: item.comments,
        rank_score: item.rank_score,
        source_id: item.source_id,
        tags: JSON.stringify(item.tags),
        llm_tokens: item.llm_tokens,
        image_url: item.image_url,
      }
    : null;
  const reader = {
    prepare: vi.fn((sql: string) => ({
      sql,
      bind: vi.fn(() => ({})),
      all: vi.fn(async () => ({ results: [] })),
      first: vi.fn(async () => null),
    })),
    batch: vi.fn(async () => [
      { results: row ? [row] : [] },
      { results: item ? sourceRows(item.sources) : [] },
    ]),
  };
  return {
    ...reader,
    withSession: vi.fn(() => reader),
  } as unknown as D1Database;
}

describe("story Markdown rendering", () => {
  it("emits a bounded, escaped contract with canonical and safe source links", () => {
    const body = renderStoryMarkdown(
      story({
        title: "<script>alert(1)</script> *Title*",
        summary: "x".repeat(2_000),
        url: "javascript:alert(1)",
        tags: ["AI", "ai", "<b>agents</b>"],
        sources: [
          {
            kind: "support",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://safe.example/source",
          },
          {
            kind: "discussion",
            author: null,
            posted_at: null,
            quote: null,
            url: "javascript:alert(1)",
          },
        ],
      })
    );

    expect(body).toContain('format: "aidr-story-markdown/v1"');
    expect(body).toContain('canonical_url: "https://aidr.today/abcdef12"');
    expect(body).toContain('published_at: "2026-02-25T06:13:20.000Z"');
    expect(body).toContain("## Summary");
    expect(body).toContain("https://safe.example/source");
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("javascript:");
    expect(body).toContain("agents");

    const summary = JSON.parse(body.match(/^summary: (.+)$/m)?.[1] ?? "null");
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeLessThanOrEqual(
      STORY_MARKDOWN_SUMMARY_MAX_CHARS
    );
  });

  it("does not fetch a source URL while rendering Markdown", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      renderStoryMarkdown(story({ url: "https://example.com/story.md" }));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("selects Vietnamese and records an explicit English fallback", () => {
    const translated = renderStoryMarkdown(
      story({
        title: "English title",
        title_vi: "Tiêu đề tiếng Việt",
        summary: "English summary",
        summary_vi: "Tóm tắt tiếng Việt",
      }),
      "vi"
    );
    expect(translated).toContain('lang: "vi"');
    expect(translated).toContain("translation_fallback: null");
    expect(translated).toContain("Tiêu đề tiếng Việt");
    expect(translated).toContain("Tóm tắt tiếng Việt");

    const fallback = renderStoryMarkdown(story(), "vi");
    expect(fallback).toContain('lang: "en"');
    expect(fallback).toContain('requested_lang: "vi"');
    expect(fallback).toContain('translation_fallback: "en"');
    expect(fallback).toContain("English is shown");
  });
});

describe("story Markdown route", () => {
  it("serves GET with Markdown, cache, CORS, nosniff, and canonical headers", async () => {
    const item = story({
      title_vi: "Tiêu đề",
      summary_vi: "Tóm tắt",
    });
    const res = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md?lang=vi`),
      fakeDb(item)
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8"
    );
    expect(res.headers.get("cache-control")).toBe(STORY_MARKDOWN_CACHE_CONTROL);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, follow");
    expect(res.headers.get("content-language")).toBe("vi");
    expect(res.headers.get("link")).toContain(
      '<https://aidr.today/abcdef12>; rel="canonical"'
    );
    expect(await res.text()).toContain("Tiêu đề");
  });

  it("serves HEAD headers with an empty body", async () => {
    const res = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md`, { method: "HEAD" }),
      fakeDb(story())
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8"
    );
    expect(res.headers.get("content-length")).toMatch(/^\d+$/);
    expect(await res.text()).toBe("");
  });

  it("returns a Markdown 404 for invalid and missing ids", async () => {
    const invalid = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/not-an-id.md`),
      fakeDb(story())
    );
    expect(invalid.status).toBe(404);
    expect(invalid.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8"
    );
    expect(invalid.headers.get("cache-control")).toBe("private, no-store");
    expect(await invalid.text()).toContain("# Story not found");

    const nested = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md/extra`),
      fakeDb(story())
    );
    expect(nested.status).toBe(404);
    expect(nested.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8"
    );

    const missing = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md`),
      fakeDb(null)
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("handles CORS preflight, unsupported methods, and invalid locales", async () => {
    const preflight = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md`, { method: "OPTIONS" }),
      undefined
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-methods")).toContain(
      "HEAD"
    );
    expect(preflight.headers.get("content-type")).toBeNull();

    const post = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md`, { method: "POST" }),
      fakeDb(story())
    );
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(post.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8"
    );

    const badLocale = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md?lang=fr`),
      fakeDb(story())
    );
    expect(badLocale.status).toBe(400);
    expect(await badLocale.text()).toContain("# Invalid language");
  });

  it("recognizes only the worker-owned .md story surface", () => {
    expect(isStoryMarkdownPath("/api/story/abcdef12.md")).toBe(true);
    expect(isStoryMarkdownPath("/api/story/not-an-id.md")).toBe(true);
    expect(isStoryMarkdownPath("/api/story/abcdef12")).toBe(false);
    expect(isStoryMarkdownPath("/api/story/abcdef12.md/extra")).toBe(true);
  });
});
