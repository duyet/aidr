import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pngBytes } from "../lib/__fixtures__/raster";
import type { FeedItem } from "../lib/types";

/** Captures the React tree the route handed to satori. */
let captured: {
  element: ReactElement;
  options: Record<string, unknown>;
} | null = null;

/** The image URL the route asked the bounded fetcher to load. */
let fetchedUrls: Array<string | null | undefined> = [];

vi.mock("@cf-wasm/og/workerd", () => ({
  cache: { setExecutionContext: () => {} },
  ImageResponse: {
    async: async (element: ReactElement, options: Record<string, unknown>) => {
      captured = { element, options };
      const headers = (options?.headers ?? {}) as Record<string, string>;
      return new Response("fake-png", {
        status: 200,
        headers: { ...headers, "content-type": "image/png" },
      });
    },
  },
}));

vi.mock("../lib/story-queries", () => ({
  getStory: vi.fn(async (_db: unknown, _prefix: string) => {
    return currentStory;
  }),
}));

vi.mock("../lib/story-og", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/story-og")>();
  return {
    ...actual,
    fetchStoryOgImage: vi.fn(async (url: string | null | undefined) => {
      fetchedUrls.push(url);
      if (!url) return null;
      // Deterministic, bounded, structurally valid image.
      return actual.storyOgImageFromBytes(pngBytes(8, 8));
    }),
  };
});

const { Route } = await import("./api/og.$id");
const { getStory } = await import("../lib/story-queries");

let currentStory: FeedItem | null = null;

type Handler = (args: {
  request: Request;
  context: unknown;
  params: Record<string, string>;
}) => Promise<Response>;

const get: Handler = (
  Route as unknown as {
    options: { server: { handlers: { GET: Handler } } };
  }
).options.server.handlers.GET;

const FAKE_DB = { prepare: () => ({}) } as unknown as D1Database;

function context(env: Record<string, unknown> | null = { DB: FAKE_DB }) {
  return env === null ? {} : { cloudflare: { env } };
}

async function call(
  url: string,
  id = "abcdef12deadbeef.png",
  ctx: unknown = context()
): Promise<Response> {
  return get({
    request: new Request(`https://aidr.today${url}`),
    context: ctx,
    params: { id },
  });
}

/** Markup for the tree the route actually rendered. */
function markup(): string {
  expect(captured).not.toBeNull();
  return renderToStaticMarkup(captured?.element as ReactElement);
}

const STORY: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://publisher.example.com/story?token=do-not-render",
  title: "A useful AI story",
  title_vi: "Một câu chuyện AI hữu ích",
  summary: "",
  summary_vi: "",
  category: "Research",
  published_at: 1_790_268_030,
  points: 82,
  comments: 144,
  rank_score: 1,
  source_id: "route-test",
  tags: [],
  sources: [],
  llm_tokens: 0,
  image_url: "https://cdn.example.com/photo.png?signature=secret",
};

beforeEach(() => {
  captured = null;
  fetchedUrls = [];
  currentStory = STORY;
  vi.mocked(getStory).mockClear();
});
describe("api/og/$id locale wiring", () => {
  it("renders the English card and header for an explicit en query", async () => {
    const response = await call("/api/og/abcdef12deadbeef.png?lang=en");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Language")).toBe("en");
    expect(response.headers.get("content-type")).toBe("image/png");

    const html = markup();
    expect(html).toContain("A useful AI story");
    expect(html).toContain("82 points");
    expect(html).toContain("144 comments");
    expect(html).toContain("Research");
    expect(html).not.toContain("Một câu chuyện AI hữu ích");
  });

  it("renders the Vietnamese card and header for a vi query", async () => {
    const response = await call("/api/og/abcdef12deadbeef.png?lang=vi");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Language")).toBe("vi");

    const html = markup();
    expect(html).toContain("Một câu chuyện AI hữu ích");
    expect(html).toContain("82 điểm");
    expect(html).toContain("144 bình luận");
    expect(html).toContain("Nghiên cứu");
    expect(html).not.toContain("A useful AI story");
  });

  it("defaults to English and ignores unknown or repeated locale values", async () => {
    for (const query of ["", "?lang=en", "?lang=fr", "?lang=vi-VN", "?lang="]) {
      const response = await call(`/api/og/abcdef12deadbeef.png${query}`);
      expect(response.headers.get("Content-Language"), query).toBe("en");
      expect(markup(), query).toContain("A useful AI story");
    }

    // A repeated value must not smuggle a second locale through.
    const repeated = await call("/api/og/abcdef12deadbeef.png?lang=en&lang=vi");
    expect(repeated.headers.get("Content-Language")).toBe("en");
    expect(markup()).toContain("A useful AI story");
  });

  it("keeps the per-locale cards in separate cache entries", async () => {
    const en = await call("/api/og/abcdef12deadbeef.png?lang=en");
    expect(markup()).toContain("A useful AI story");

    const vi = await call("/api/og/abcdef12deadbeef.png?lang=vi");
    expect(markup()).toContain("Một câu chuyện AI hữu ích");

    const enAgain = await call("/api/og/abcdef12deadbeef.png?lang=en");
    expect(markup()).toContain("A useful AI story");

    for (const response of [en, vi, enAgain]) {
      const cacheControl = response.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("s-maxage=604800");
    }
    // Same URL plus same locale is a stable cache entry; the two locales
    // share the policy but render different copy.
    expect(en.headers.get("Cache-Control")).toBe(
      enAgain.headers.get("Cache-Control")
    );
    expect(vi.headers.get("Content-Language")).toBe("vi");
    expect(enAgain.headers.get("Content-Language")).toBe("en");
  });
});

describe("api/og/$id request wiring", () => {
  it("strips a .png suffix and looks the story up by id prefix", async () => {
    await call("/api/og/abcdef12deadbeef.png?lang=en");
    expect(getStory).toHaveBeenCalledWith(
      expect.anything(),
      "abcdef12deadbeef"
    );
  });

  it("accepts a suffix-style slug and the bare hex id", async () => {
    await call("/api/og/abcdef12deadbeef?lang=en", "abcdef12deadbeef");
    expect(vi.mocked(getStory).mock.calls[0]?.[1]).toBe("abcdef12deadbeef");

    vi.mocked(getStory).mockClear();
    await call(
      "/api/og/some-story-headline-abcdef12deadbeef.png?lang=en",
      "some-story-headline-abcdef12deadbeef.png"
    );
    expect(vi.mocked(getStory).mock.calls[0]?.[1]).toBe("abcdef12deadbeef");
  });

  it("404s an id that is not a real hex prefix", async () => {
    for (const id of [
      "nope",
      "zz",
      "abc.png",
      // A non-hex label in the suffix position must not resolve.
      `headline-${"z".repeat(20)}.png`,
      // Over-long ids are truncated, then still have to be all hex.
      `${"z".repeat(80)}.png`,
    ]) {
      const response = await call("/api/og/x?lang=en", id);
      expect(response.status, id).toBe(404);
      expect(getStory).not.toHaveBeenCalled();
    }
  });

  it("404s a well-formed id with no matching story", async () => {
    currentStory = null;
    const response = await call("/api/og/abcdef12deadbeef.png?lang=en");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
    // No card is rendered and no image is fetched for a missing story.
    expect(captured).toBeNull();
    expect(fetchedUrls).toEqual([]);
  });

  it("500s when the D1 binding is missing", async () => {
    const response = await call(
      "/api/og/abcdef12deadbeef.png?lang=en",
      "abcdef12deadbeef.png",
      context(null)
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "D1 binding DB not configured",
    });
    expect(captured).toBeNull();
  });

  it("renders at the card dimensions with the editorial chrome", async () => {
    await call("/api/og/abcdef12deadbeef.png?lang=vi");
    expect(captured?.options).toMatchObject({
      width: 1200,
      height: 630,
    });
    const html = markup();
    expect(html).toContain("AI;DR");
    expect(html).toContain("aidr.today");
    expect(html).toContain("publisher.example.com");
  });
});

describe("api/og/$id image boundary", () => {
  it("routes the story image through the bounded fetcher exactly once", async () => {
    await call("/api/og/abcdef12deadbeef.png?lang=en");
    expect(fetchedUrls).toEqual([STORY.image_url]);
    expect(markup()).toContain("data:image/png;base64,");
  });

  it("never puts the source URL, query string, or signature in the card", async () => {
    await call("/api/og/abcdef12deadbeef.png?lang=en");
    const html = markup();
    expect(html).not.toContain("publisher.example.com/story");
    expect(html).not.toContain("do-not-render");
    expect(html).not.toContain("signature");
    expect(html).not.toContain("cdn.example.com");
  });

  it("uses the branded fallback when there is no story image", async () => {
    currentStory = { ...STORY, image_url: null };
    const response = await call("/api/og/abcdef12deadbeef.png?lang=en");
    expect(response.status).toBe(200);
    expect(fetchedUrls).toEqual([null]);
    const html = markup();
    expect(html).not.toContain("<img");
    expect(html).toContain("AI NEWS");
  });

  it("uses the branded fallback when the bounded fetcher misses", async () => {
    const { fetchStoryOgImage } = await import("../lib/story-og");
    vi.mocked(fetchStoryOgImage).mockResolvedValueOnce(null);
    const response = await call("/api/og/abcdef12deadbeef.png?lang=en");
    expect(response.status).toBe(200);
    expect(markup()).not.toContain("<img");
    expect(markup()).toContain("AI NEWS");
  });
});
