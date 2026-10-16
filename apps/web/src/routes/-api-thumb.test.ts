/**
 * `/api/thumb/$id` resizes only a picture the story already carries. The
 * defects guarded here: an open proxy (any `u` fetched), a resize failure
 * that hides the thumb instead of sending the browser to the publisher, and
 * a stale edge copy served for a different `u`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedItem } from "../lib/types";

vi.mock("../lib/story-queries", () => ({
  getStory: vi.fn(async () => currentStory),
}));

const { Route, THUMB_SIDE } = await import("./api/thumb.$id");

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

const OWNED = "https://cdn.example.com/hero-1920x1080.jpeg";
const MANIFEST_IMAGE = "https://cdn.example.com/second.png";

const STORY: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://publisher.example.com/story",
  title: "A useful AI story",
  title_vi: "",
  summary: "",
  summary_vi: "",
  category: "Research",
  published_at: 1_790_268_030,
  points: 0,
  comments: 0,
  rank_score: 1,
  source_id: "route-test",
  tags: [],
  sources: [],
  llm_tokens: 0,
  image_url: OWNED,
  media_manifest: {
    version: 1,
    assets: [{ type: "image", url: MANIFEST_IMAGE }],
  } as FeedItem["media_manifest"],
};

let currentStory: FeedItem | null = STORY;
let fetched: string[] = [];
let transforms: Array<Record<string, unknown>> = [];
let outputs: Array<Record<string, unknown>> = [];
let transformFails = false;

function fakeImages(): ImagesBinding {
  return {
    input: () => ({
      transform: (options: Record<string, unknown>) => {
        transforms.push(options);
        return {
          output: async (format: Record<string, unknown>) => {
            if (transformFails) throw new Error("decode failed");
            outputs.push(format);
            return {
              response: () =>
                new Response("webp-bytes", {
                  headers: { "content-type": "image/webp" },
                }),
            };
          },
        };
      },
    }),
  } as unknown as ImagesBinding;
}

const FAKE_DB = { prepare: () => ({}) } as unknown as D1Database;

function call(
  u: string | null,
  env: Record<string, unknown> = { DB: FAKE_DB, IMAGES: fakeImages() }
): Promise<Response> {
  const query = u === null ? "" : `?u=${encodeURIComponent(u)}`;
  return get({
    request: new Request(
      `https://aidr.today/api/thumb/abcdef12deadbeef${query}`
    ),
    context: { cloudflare: { env } },
    params: { id: "abcdef12deadbeef" },
  });
}

beforeEach(() => {
  currentStory = STORY;
  fetched = [];
  transforms = [];
  outputs = [];
  transformFails = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetched.push(url);
      return new Response("jpeg-bytes", {
        headers: { "content-type": "image/jpeg" },
      });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api/thumb/$id", () => {
  it("resizes the story's own image to a square WebP with long caching", async () => {
    const res = await call(OWNED);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("s-maxage=604800");
    expect(await res.text()).toBe("webp-bytes");
    expect(fetched).toEqual([OWNED]);
    expect(transforms).toEqual([
      { width: THUMB_SIDE, height: THUMB_SIDE, fit: "cover" },
    ]);
    expect(outputs[0]?.format).toBe("image/webp");
  });

  it("accepts a manifest image asset as well as image_url", async () => {
    const res = await call(MANIFEST_IMAGE);
    expect(res.status).toBe(200);
    expect(fetched).toEqual([MANIFEST_IMAGE]);
  });

  it("refuses a URL the story does not carry before fetching anything", async () => {
    const res = await call("https://cdn.example.com/not-ours.jpg");
    expect(res.status).toBe(404);
    expect(fetched).toEqual([]);
  });

  it("refuses a missing u, an unknown story and a private host without fetching", async () => {
    expect((await call(null)).status).toBe(404);
    expect((await call("http://10.0.0.1/hero.jpg")).status).toBe(404);
    currentStory = null;
    expect((await call(OWNED)).status).toBe(404);
    expect(fetched).toEqual([]);
  });

  it("sends the browser to the publisher URL when the resize fails", async () => {
    transformFails = true;
    const res = await call(OWNED);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(OWNED);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("sends the browser to the publisher URL when the publisher answers non-image or 3xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>", {
            status: 302,
            headers: { location: "http://10.0.0.1/x" },
          })
      )
    );
    const res = await call(OWNED);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(OWNED);
    expect(transforms).toEqual([]);
  });

  it("sends the browser to the publisher URL without an Images binding", async () => {
    const res = await call(OWNED, { DB: FAKE_DB });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(OWNED);
    expect(fetched).toEqual([]);
  });
});
