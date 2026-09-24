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

function encodedMarkdownExtension(layers: number): string {
  return `${"%25".repeat(layers - 1)}2emd`;
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
    prepare: vi.fn((sql: string) => {
      const statement = {
        sql,
        bindings: [] as Array<string | number>,
        bind: vi.fn((...bindings: Array<string | number>) => {
          statement.bindings = bindings;
          return statement;
        }),
        all: vi.fn(async () => ({ results: [] })),
        first: vi.fn(async () => null),
      };
      return statement;
    }),
    batch: vi.fn(
      async (statements: Array<{ bindings: Array<string | number> }>) => {
        const bindings = statements[0]?.bindings ?? [];
        const idPrefix = String(bindings.at(-1) ?? "");
        const matches = (candidate: string): boolean =>
          candidate.startsWith(idPrefix);
        return [
          { results: rows.filter((row) => matches(String(row.id))) },
          {
            results: sources.filter((row) => matches(String(row.item_id))),
          },
        ];
      }
    ),
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
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/keep?utm_source=agent&id=story-42&q=agents",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/nested?q=https%3A%2F%2Fexample.com%2Farticle%3Fid%3D7",
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
            url: "https://example.com/?%2561ccess_token=double-secret",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/?q=access_token%253Dcompound-secret",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/?utm_token=utm-token-secret",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/?utm_client_secret=utm-client-secret",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/?utm_signature=utm-signature-secret",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/?utm%5Ftoken=encoded-utm-token-secret",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/?utm%25255Fclient%25255Fsecret=double-encoded-utm-secret",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/?q=https%3A%2F%2F127.0.0.1%2Fadmin%3Fsecret%3Dnested-private",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/?q=https%3A%2F%2Flocalhost%2Fmetadata",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/?q=foo%253DBasic%2520dXNlcjpwYXNz",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/?q=foo%253DBearer%2520encoded-bearer-secret",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/?q=foo%253DeyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJqd3Qtc2VjcmV0In0.signature",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/access_token/path-secret",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/path#%2523access_token%3Dfragment-secret",
          },
          {
            kind: "source",
            author: null,
            posted_at: null,
            quote: null,
            url: "https://example.com/path/%2523access_token%3Dencoded-fragment-secret",
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
    expect(body).toContain(
      'canonical_url: "https://aidr.today/abcdef12?lang=vi"'
    );
    expect(body).toContain('published_at: "2026-02-25T06:13:20.000Z"');
    expect(body).toContain("## Summary");
    expect(body).toContain("https://safe.example/source");
    expect(body).toContain(
      "https://example.com/keep?utm_source=agent&id=story-42&q=agents"
    );
    expect(body).toContain(
      "https://example.com/nested?q=https%3A%2F%2Fexample.com%2Farticle%3Fid%3D7"
    );
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("javascript:");
    expect(body).not.toContain("127.0.0.1");
    expect(body).not.toContain("169.254.169.254");
    expect(body).not.toContain("::1");
    expect(body).not.toContain("::ffff");
    expect(body).not.toContain("metadata.google.internal");
    expect(body).not.toContain("access_token");
    expect(body).not.toContain("secret");
    expect(body).not.toContain("double-secret");
    expect(body).not.toContain("compound-secret");
    expect(body).not.toContain("utm-token-secret");
    expect(body).not.toContain("utm-client-secret");
    expect(body).not.toContain("utm-signature-secret");
    expect(body).not.toContain("encoded-utm-token-secret");
    expect(body).not.toContain("double-encoded-utm-secret");
    expect(body).not.toContain("nested-private");
    expect(body).not.toContain("localhost");
    expect(body).not.toContain("dXNlcjpwYXNz");
    expect(body).not.toContain("encoded-bearer-secret");
    expect(body).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(body).not.toContain("path-secret");
    expect(body).not.toContain("fragment-secret");
    expect(body).not.toContain("encoded-fragment-secret");
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
      '<https://aidr.today/abcdef12?lang=vi>; rel="canonical"'
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

    const doubleEncoded = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12%252emd`),
      fakeDb(story())
    );
    expect(doubleEncoded.status).toBe(404);
    expect(doubleEncoded.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8"
    );

    const doubleEncodedPrefix = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api%252Fstory/abcdef12%252emd`),
      fakeDb(story())
    );
    expect(doubleEncodedPrefix.status).toBe(404);
    expect(doubleEncodedPrefix.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8"
    );

    const tripleEncoded = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef12%25252emd`),
      fakeDb(story())
    );
    expect(tripleEncoded.status).toBe(404);
    expect(tripleEncoded.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8"
    );

    const malformedSuffix = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/%ZZ.md`),
      fakeDb(story())
    );
    expect(malformedSuffix.status).toBe(404);
    expect(malformedSuffix.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8"
    );

    for (const layers of [4, 5, 6, 9]) {
      const overEncoded = await handleStoryMarkdownRequest(
        new Request(
          `${SITE_URL}/api/story/abcdef12${encodedMarkdownExtension(layers)}`
        ),
        fakeDb(story())
      );
      expect(overEncoded.status).toBe(404);
      expect(overEncoded.headers.get("content-type")).toBe(
        "text/plain; charset=utf-8"
      );
      expect(await overEncoded.text()).toBe("Story Markdown not found.\n");
    }

    const encodedInvalid = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/%6Eot-an-id.md`),
      fakeDb(story())
    );
    expect(encodedInvalid.status).toBe(404);
    expect(encodedInvalid.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8"
    );

    const nineCharacterPrefix = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef123.md`),
      fakeDb(story())
    );
    expect(nineCharacterPrefix.status).toBe(308);
    expect(nineCharacterPrefix.headers.get("location")).toBe(
      `${SITE_URL}/api/story/abcdef12.md?lang=vi`
    );

    const fullId = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef1234567890.md`),
      fakeDb(story())
    );
    expect(fullId.status).toBe(308);
    expect(fullId.headers.get("location")).toBe(
      `${SITE_URL}/api/story/abcdef12.md?lang=vi`
    );

    const unavailableFullId = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef1234567890.md`),
      undefined
    );
    expect(unavailableFullId.status).toBe(503);
    expect(unavailableFullId.headers.get("location")).toBeNull();

    const nonmatchingFullId = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/${"f".repeat(64)}.md`),
      fakeDb(story())
    );
    expect(nonmatchingFullId.status).toBe(404);
    expect(nonmatchingFullId.headers.get("location")).toBeNull();

    const nineCharacterCollision = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef123.md`),
      fakeDb([
        story({ id: "abcdef1234567890" }),
        story({ id: "abcdef1239999999" }),
      ])
    );
    expect(nineCharacterCollision.status).toBe(409);
    expect(nineCharacterCollision.headers.get("location")).toBeNull();

    const fullIdCollision = await handleStoryMarkdownRequest(
      new Request(`${SITE_URL}/api/story/abcdef1234567890.md`),
      fakeDb([
        story({ id: "abcdef1234567890" }),
        story({ id: "abcdef1299999999" }),
      ])
    );
    expect(fullIdCollision.status).toBe(409);
    expect(fullIdCollision.headers.get("location")).toBeNull();
    expect(await fullIdCollision.text()).toContain("# Ambiguous story id");

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
    expect(legacy.status).toBe(307);
    expect(legacy.headers.get("location")).toBe(
      `${SITE_URL}/api/story/abcdef12.md?utm_source=agent&lang=en`
    );

    const secretRedirect = await handleStoryMarkdownRequest(
      new Request(
        `${SITE_URL}/api/story/abcdef12.md?locale=en&access_token=do-not-redirect&%2561ccess_token=double-redirect-secret&utm_source=agent&utm_medium=email&utm_token=redirect-utm-token&utm_client_secret=redirect-client-secret&utm_signature=redirect-signature-secret&utm%5Ftoken=encoded-redirect-utm-token&utm%25255Fsignature=double-encoded-redirect-signature&note=%2523access_token%3Dfragment-redirect-secret&q=foo%253Daccess_token%253Dcompound-redirect-secret&q=Basic%2520dXNlcjpwYXNz&q=foo%253DeyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJqd3Qtc2VjcmV0In0.signature&q=https%3A%2F%2F169.254.169.254%2Flatest&q=agents`
      ),
      fakeDb(story())
    );
    const secretLocation = secretRedirect.headers.get("location");
    const secretBody = await secretRedirect.text();
    expect(secretLocation).toBe(
      `${SITE_URL}/api/story/abcdef12.md?utm_source=agent&utm_medium=email&q=agents&lang=en`
    );
    expect(secretLocation).not.toContain("do-not-redirect");
    expect(secretLocation).not.toContain("double-redirect-secret");
    expect(secretLocation).not.toContain("fragment-redirect-secret");
    expect(secretLocation).not.toContain("compound-redirect-secret");
    expect(secretLocation).not.toContain("redirect-utm-token");
    expect(secretLocation).not.toContain("redirect-client-secret");
    expect(secretLocation).not.toContain("redirect-signature-secret");
    expect(secretLocation).not.toContain("encoded-redirect-utm-token");
    expect(secretLocation).not.toContain("double-encoded-redirect-signature");
    expect(secretLocation).not.toContain("169.254.169.254");
    expect(secretLocation).not.toContain("dXNlcjpwYXNz");
    expect(secretLocation).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(secretBody).not.toContain("do-not-redirect");
    expect(secretBody).not.toContain("double-redirect-secret");
    expect(secretBody).not.toContain("fragment-redirect-secret");
    expect(secretBody).not.toContain("compound-redirect-secret");
    expect(secretBody).not.toContain("redirect-utm-token");
    expect(secretBody).not.toContain("redirect-client-secret");
    expect(secretBody).not.toContain("redirect-signature-secret");
    expect(secretBody).not.toContain("encoded-redirect-utm-token");
    expect(secretBody).not.toContain("double-encoded-redirect-signature");
    expect(secretBody).not.toContain("169.254.169.254");
    expect(secretBody).not.toContain("dXNlcjpwYXNz");
    expect(secretBody).not.toContain("eyJhbGciOiJIUzI1NiJ9");

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
    expect(isStoryMarkdownPath("/api/story/abcdef12%252emd")).toBe(true);
    expect(isStoryMarkdownPath("/api%252Fstory/abcdef12%252emd")).toBe(true);
    expect(isStoryMarkdownPath("/api/story/abcdef12%25252emd")).toBe(true);
    for (const layers of [4, 5, 6, 9]) {
      expect(
        isStoryMarkdownPath(
          `/api/story/abcdef12${encodedMarkdownExtension(layers)}`
        )
      ).toBe(true);
    }
    expect(isStoryMarkdownPath("/api/story/%ZZ.md")).toBe(true);
    expect(isStoryMarkdownPath("/api/story/%ZZ%2emd")).toBe(true);
    expect(isStoryMarkdownPath("/api%2Fstory/%ZZ%2emd")).toBe(true);
    expect(isStoryMarkdownPath("/api/story/not-an-id.md")).toBe(true);
    expect(isStoryMarkdownPath("/api/story/abcdef12")).toBe(false);
    expect(isStoryMarkdownPath("/api/story/abcdef12.md/extra")).toBe(true);
  });
});
