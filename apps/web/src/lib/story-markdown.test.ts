import { describe, expect, it, vi } from "vitest";
import { SITE_URL } from "./site";
import {
  handleStoryMarkdownRequest,
  isStoryMarkdownPath,
  renderStoryMarkdown,
  STORY_MARKDOWN_CACHE_CONTROL,
  STORY_MARKDOWN_MAX_RESPONSE_BYTES,
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

function sourceRows(
  itemId: string,
  sources: ItemSource[]
): Record<string, unknown>[] {
  return sources.map((source) => ({
    item_id: itemId,
    ...source,
  }));
}

function storyRow(item: FeedItem): Record<string, unknown> {
  return {
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
  };
}

function fakeDb(item: FeedItem | FeedItem[] | null): D1Database {
  const items = item === null ? [] : Array.isArray(item) ? item : [item];
  const rows = items.map(storyRow);
  const sources = items.flatMap((entry) => sourceRows(entry.id, entry.sources));
  const reader = {
    prepare: vi.fn((sql: string) => ({
      sql,
      bind: vi.fn(() => ({})),
      all: vi.fn(async () => ({ results: [] })),
      first: vi.fn(async () => null),
    })),
    batch: vi.fn(async () => [{ results: rows }, { results: sources }]),
  };
  return {
    ...reader,
    withSession: vi.fn(() => reader),
  } as unknown as D1Database;
}

function rawDb(row: Record<string, unknown> | null): D1Database {
  const reader = {
    prepare: vi.fn((sql: string) => ({
      sql,
      bind: vi.fn(() => ({})),
      all: vi.fn(async () => ({ results: [] })),
      first: vi.fn(async () => null),
    })),
    batch: vi.fn(async () => [{ results: row ? [row] : [] }, { results: [] }]),
  };
  return {
    ...reader,
    withSession: vi.fn(() => reader),
  } as unknown as D1Database;
}

function renderWithoutFetch(
  item: FeedItem,
  requestedLang?: "en" | "vi"
): string {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("unexpected fetch");
  });
  try {
    return renderStoryMarkdown(item, requestedLang);
  } finally {
    fetchSpy.mockRestore();
  }
}

function failingDb(): D1Database {
  const failure = new Error("D1 secret=do-not-log");
  const reader = {
    prepare: vi.fn((sql: string) => ({
      sql,
      bind: vi.fn(() => ({})),
      all: vi.fn(async () => {
        throw failure;
      }),
      first: vi.fn(async () => {
        throw failure;
      }),
    })),
    batch: vi.fn(async () => {
      throw failure;
    }),
  };
  return {
    ...reader,
    withSession: vi.fn(() => reader),
  } as unknown as D1Database;
}

describe("story Markdown rendering", () => {
  it("emits a bounded, escaped contract with canonical and safe source links", () => {
    const body = renderWithoutFetch(
      story({
        title: "- <script>alert(1)</script> *Title* ~~~",
        summary: "- list item\n~~~\n\u0000\u0085",
        url: "https://example.com/story?access_token=secret",
        tags: ["AI", "ai", "<b>agents</b>", "-topic", "~tag"],
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
            url: "https://127.0.0.1/private",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://169.254.169.254/latest/meta-data",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://[::1]/private",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://[::ffff:127.0.0.1]/private",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/redirect?to=https%3A%2F%2Fother.example%3Ftoken%3Dnested-secret",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/story#access_token=fragment-secret",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://metadata.google.internal/computeMetadata/v1/",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: `https://example.com/${"x".repeat(1_100)}`,
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
    expect(body).not.toContain("127.0.0.1");
    expect(body).not.toContain("169.254.169.254");
    expect(body).not.toContain("::1");
    expect(body).not.toContain("::ffff");
    expect(body).not.toContain("metadata.google.internal");
    expect(body).not.toContain("access_token");
    expect(body).not.toContain("secret");
    expect(body).not.toContain("nested-secret");
    expect(body).toContain("\\-");
    expect(body).toContain("\\~");
    expect(body).toContain("agents");

    const summary = JSON.parse(body.match(/^summary: (.+)$/m)?.[1] ?? "null");
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeLessThanOrEqual(
      STORY_MARKDOWN_SUMMARY_MAX_CHARS
    );
    const sourceUrls = JSON.parse(
      body.match(/^source_urls: (.+)$/m)?.[1] ?? "null"
    ) as string[];
    expect(sourceUrls.length).toBeLessThanOrEqual(8);
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(
      STORY_MARKDOWN_MAX_RESPONSE_BYTES
    );
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
    expect(fallback).toContain('available_langs: ["en"]');
    expect(fallback).toContain('translation_fallback: "en"');
    expect(fallback).toContain('fallback_fields: ["title","summary"]');
    expect(fallback).toContain("English fallback used for: title, summary.");

    const partial = renderStoryMarkdown(
      story({
        title_vi: "<b>Tiêu đề</b>",
        summary_vi: " \u0000 ",
      }),
      "vi"
    );
    expect(partial).toContain('lang: "vi"');
    expect(partial).toContain('fallback_fields: ["summary"]');
    expect(partial).toContain("Tiêu đề");
    expect(partial).toContain("A short summary.");

    const htmlOnly = renderStoryMarkdown(
      story({
        title_vi: "<script>do-not-render</script>",
        summary_vi: "<style>bad</style>",
      }),
      "vi"
    );
    expect(htmlOnly).toContain('lang: "en"');
    expect(htmlOnly).toContain('fallback_fields: ["title","summary"]');
    expect(htmlOnly).not.toContain("do-not-render");
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
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toBe("Cookie, Accept-Language");
    expect(res.headers.get("content-language")).toBe("en");
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

    const encoded = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/%61bcdef12%2emd`),
      fakeDb(story())
    );
    expect(encoded.status).toBe(200);
    expect(encoded.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8"
    );

    const encodedPrefix = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api%2Fstory/abcdef12%2emd`),
      fakeDb(story())
    );
    expect(encodedPrefix.status).toBe(200);

    const malformedEncoded = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/%ZZ%2emd`),
      fakeDb(story())
    );
    expect(malformedEncoded.status).toBe(404);
    expect(malformedEncoded.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8"
    );

    const encodedInvalid = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/%6Eot-an-id.md`),
      fakeDb(story())
    );
    expect(encodedInvalid.status).toBe(404);
    expect(encodedInvalid.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8"
    );

    const fullId = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef1234567890.md`),
      fakeDb(story())
    );
    expect(fullId.status).toBe(308);
    expect(fullId.headers.get("location")).toBe(
      `${SITE_URL}/api/story/abcdef12.md`
    );

    const collision = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md`),
      fakeDb([
        story({ id: "abcdef12aaaaaaaa" }),
        story({ id: "abcdef12bbbbbbbb" }),
      ])
    );
    expect(collision.status).toBe(409);
    expect(collision.headers.get("cache-control")).toBe("private, no-store");
    expect(await collision.text()).toContain("# Ambiguous story id");

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

    const duplicate = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md?lang=en&lang=vi`),
      fakeDb(story())
    );
    expect(duplicate.status).toBe(400);

    const conflict = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md?lang=en&locale=vi`),
      fakeDb(story())
    );
    expect(conflict.status).toBe(400);

    const legacy = await handleStoryMarkdownRequest(
      new Request(
        `${SITE_URL}/api/story/abcdef12.md?locale=en&utm_source=agent`
      ),
      fakeDb(story())
    );
    expect(legacy.status).toBe(308);
    expect(legacy.headers.get("location")).toBe(
      `${SITE_URL}/api/story/abcdef12.md?utm_source=agent&lang=en`
    );

    const secretRedirect = await handleStoryMarkdownRequest(
      new Request(
        `${SITE_URL}/api/story/abcdef12.md?locale=en&access_token=do-not-redirect&utm_source=agent`
      ),
      fakeDb(story())
    );
    expect(secretRedirect.headers.get("location")).toBe(
      `${SITE_URL}/api/story/abcdef12.md?utm_source=agent&lang=en`
    );

    const cookieWins = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md`, {
        headers: {
          Cookie: "news_lang=en",
          "Accept-Language": "vi",
        },
      }),
      fakeDb(story())
    );
    expect(cookieWins.status).toBe(200);
    expect(cookieWins.headers.get("content-language")).toBe("en");
    expect(cookieWins.headers.get("cache-control")).toBe("private, no-store");

    const headerWins = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md`, {
        headers: { "Accept-Language": "fr, vi-VN;q=0.8, en;q=0.6" },
      }),
      fakeDb(
        story({
          title_vi: "Tiêu đề",
          summary_vi: "Tóm tắt",
        })
      )
    );
    expect(headerWins.headers.get("content-language")).toBe("vi");
  });

  it("redacts lookup failures and safely renders malformed D1 rows", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failed = await handleStoryMarkdownRequest(
        new Request(`${SITE_URL}/api/story/abcdef12.md?lang=en`),
        failingDb()
      );
      expect(failed.status).toBe(500);
      expect(failed.headers.get("cache-control")).toBe("private, no-store");
      expect(await failed.text()).not.toContain("D1 secret");
      expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("D1 secret");
    } finally {
      errorSpy.mockRestore();
    }

    const malformed = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12.md?lang=en`),
      rawDb({
        id: "abcdef1234567890",
        url: 42,
        title: { secret: "do-not-render" },
        summary: { secret: "do-not-render" },
        published_at: "not-a-timestamp",
        tags: "not-json",
      })
    );
    expect(malformed.status).toBe(200);
    expect(malformed.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8"
    );
    const malformedBody = await malformed.text();
    expect(malformedBody).toContain("# Untitled story");
    expect(malformedBody).not.toContain("do-not-render");
  });

  it("recognizes only the worker-owned .md story surface", () => {
    expect(isStoryMarkdownPath("/api/story/abcdef12.md")).toBe(true);
    expect(isStoryMarkdownPath("/api/story/%61bcdef12%2emd")).toBe(true);
    expect(isStoryMarkdownPath("/api/story/%ZZ%2emd")).toBe(true);
    expect(isStoryMarkdownPath("/api%2Fstory/%ZZ%2emd")).toBe(true);
    expect(isStoryMarkdownPath("/api/story/not-an-id.md")).toBe(true);
    expect(isStoryMarkdownPath("/api/story/abcdef12")).toBe(false);
    expect(isStoryMarkdownPath("/api/story/abcdef12.md/extra")).toBe(true);
  });
});
