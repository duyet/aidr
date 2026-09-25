import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  fetchStoryOgImage,
  isSafeStoryImageUrl,
  MAX_STORY_OG_IMAGE_BYTES,
  storyOgCard,
  storyOgCopy,
  storyOgImageFromBytes,
  storyOgLanguage,
} from "./story-og";
import type { FeedItem } from "./types";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "abcdef12deadbeef",
    url: "https://publisher.example.com/story?token=do-not-render",
    title: "A useful AI story",
    title_vi: "Một câu chuyện AI hữu ích",
    summary: "A short summary.",
    summary_vi: "Tóm tắt ngắn.",
    category: "Research",
    published_at: 1_790_268_030,
    points: 82,
    comments: 144,
    rank_score: 1,
    source_id: "fixture",
    tags: [],
    sources: [],
    llm_tokens: 0,
    image_url: "https://cdn.example.com/photo.png?signature=secret",
    ...overrides,
  };
}

describe("story OG image URL boundary", () => {
  it("accepts public HTTP(S) image URLs", () => {
    expect(
      isSafeStoryImageUrl("https://jf.x.com/images/media-preview/123")
    ).toBe(true);
    expect(isSafeStoryImageUrl("http://cdn.example.com/photo.jpg")).toBe(true);
    expect(isSafeStoryImageUrl("https://cdn.example.com:443/photo.jpg")).toBe(
      true
    );
  });

  it("rejects unsafe schemes, credentials, local hosts, and private IPs", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "https://user:password@cdn.example.com/photo.png",
      "https://localhost/photo.png",
      "https://127.0.0.1/photo.png",
      "https://10.0.0.1/photo.png",
      "https://169.254.169.254/latest/meta-data",
      "https://192.168.1.10/photo.png",
      "https://[::1]/photo.png",
      "https://cdn.example.com:8443/photo.png",
    ]) {
      expect(isSafeStoryImageUrl(url), url).toBe(false);
    }
  });

  it("bounds URL length before fetching", () => {
    expect(
      isSafeStoryImageUrl(`https://cdn.example.com/${"a".repeat(2100)}.png`)
    ).toBe(false);
  });
});

describe("fetchStoryOgImage", () => {
  it("inlines a valid raster response without retaining its source URL", async () => {
    let received: RequestInit | undefined;
    const image = await fetchStoryOgImage(
      "https://cdn.example.com/photo.png?signature=secret",
      {
        fetcher: async (_input, init) => {
          received = init;
          return new Response(PNG_BYTES, {
            headers: { "content-type": "image/png" },
          });
        },
      }
    );

    expect(image).not.toBeNull();
    expect(image?.mimeType).toBe("image/png");
    expect(image?.dataUri).toMatch(/^data:image\/png;base64,/);
    expect(image?.dataUri).not.toContain("cdn.example.com");
    expect(image?.dataUri).not.toContain("secret");
    expect(received).toMatchObject({
      method: "GET",
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  });

  it("falls back cleanly for redirects, non-images, failures, and oversized data", async () => {
    const cases: Array<typeof fetch> = [
      async () => new Response(null, { status: 302 }),
      async () =>
        new Response("<html>not an image</html>", {
          headers: { "content-type": "text/html" },
        }),
      async () =>
        new Response(PNG_BYTES, {
          headers: { "content-type": "image/svg+xml" },
        }),
      async () => {
        throw new Error("network down");
      },
      async () =>
        new Response(new Uint8Array(MAX_STORY_OG_IMAGE_BYTES + 1), {
          headers: { "content-type": "image/png" },
        }),
      async () =>
        new Response(PNG_BYTES, {
          headers: {
            "content-type": "image/png",
            "content-length": String(MAX_STORY_OG_IMAGE_BYTES + 1),
          },
        }),
    ];
    for (const fetcher of cases) {
      await expect(
        fetchStoryOgImage("https://cdn.example.com/photo.png", { fetcher })
      ).resolves.toBeNull();
    }
  });

  it("rejects malformed image bytes even when the server labels them as an image", async () => {
    await expect(
      fetchStoryOgImage("https://cdn.example.com/photo.png", {
        fetcher: async () =>
          new Response("<svg>not a raster</svg>", {
            headers: { "content-type": "image/png" },
          }),
      })
    ).resolves.toBeNull();
  });
});

describe("story OG copy and renderer", () => {
  it("selects the requested locale and never includes source URL/query text", () => {
    const copy = storyOgCopy(item(), "vi");
    expect(copy.title).toBe("Một câu chuyện AI hữu ích");
    expect(copy.pointsLabel).toBe("điểm");
    expect(copy.commentsLabel).toBe("bình luận");
    expect(copy.category).toBe("Nghiên cứu");
    expect(copy.host).toBe("publisher.example.com");
    expect(JSON.stringify(copy)).not.toContain("do-not-render");
    expect(JSON.stringify(copy)).not.toContain("secret");
  });

  it("renders a readable branded fallback without a broken image element", () => {
    const html = renderToStaticMarkup(storyOgCard(item(), null, "en"));
    expect(html).toContain("AI;DR");
    expect(html).toContain("aidr.today");
    expect(html).toContain("A useful AI story");
    expect(html).toContain("82 points");
    expect(html).not.toContain("do-not-render");
    expect(html).not.toContain("<img");
  });

  it("renders a secondary image treatment and locale-specific copy when available", () => {
    const image = storyOgImageFromBytes(PNG_BYTES);
    expect(image).not.toBeNull();
    const first = renderToStaticMarkup(storyOgCard(item(), image, "vi"));
    const second = renderToStaticMarkup(storyOgCard(item(), image, "vi"));
    expect(first).toBe(second);
    expect(first).toContain("Một câu chuyện AI hữu ích");
    expect(first).toContain("BÀI VIẾT");
    expect(first).toContain("82 điểm");
    expect(first).toContain("data:image/png;base64,");
    expect(first).not.toContain("do-not-render");
    expect(first).not.toContain("secret");
  });

  it("only treats an exact vi query as Vietnamese and bounds invalid metrics", () => {
    expect(storyOgLanguage("vi")).toBe("vi");
    expect(storyOgLanguage("en")).toBe("en");
    expect(storyOgLanguage("fr")).toBe("en");
    const copy = storyOgCopy(
      item({ points: Number.NaN, comments: -10, title: "x".repeat(400) }),
      "en"
    );
    expect(copy.title.length).toBeLessThanOrEqual(280);
    expect(copy.points).toBe("0");
    expect(copy.comments).toBe("0");
  });
});
