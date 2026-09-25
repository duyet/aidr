import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  gifBytes,
  jpegBytes,
  PNG_SIGNATURE,
  pngBytes,
  pngHeaderOnly,
  webpBytes,
} from "./__fixtures__/raster";
import {
  fetchStoryOgImage,
  isSafeStoryImageUrl,
  MAX_STORY_OG_IMAGE_BYTES,
  MAX_STORY_OG_IMAGE_PIXELS,
  MAX_STORY_OG_IMAGE_SIDE,
  MIN_STORY_IMAGE_TIMEOUT_MS,
  STORY_OG_TITLE_BAND_HEIGHT,
  STORY_OG_TITLE_BAND_TOP,
  STORY_OG_TITLE_MAX_HEIGHT,
  storyOgCard,
  storyOgCopy,
  storyOgImageFromBytes,
  storyOgLanguage,
} from "./story-og";
import type { FeedItem } from "./types";

/** A real, structurally complete 8x8 PNG. */
const PNG_BYTES = pngBytes(8, 8);

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

  it("normalizes a trailing root label before the blocklist runs", () => {
    // `URL` keeps the trailing dot, so every one of these resolves to
    // `localhost.` / `metadata.google.internal.` / `cdn.internal.` and would
    // slip past a naive `host === "localhost"` comparison.
    for (const url of [
      "https://localhost./photo.png",
      "https://LOCALHOST./photo.png",
      "https://metadata.google.internal./latest/meta-data",
      "https://cdn.internal./photo.png",
      "https://metadata.google.internal../photo.png",
      "https://foo.local./photo.png",
      "https://db.localhost./photo.png",
      "https://printer.local./photo.png",
    ]) {
      expect(isSafeStoryImageUrl(url), url).toBe(false);
    }
  });

  it("still accepts public hosts after trailing-dot normalization", () => {
    // A root label on an otherwise public host stays allowed.
    expect(isSafeStoryImageUrl("https://cdn.example.com./photo.png")).toBe(
      true
    );
    expect(
      isSafeStoryImageUrl("https://notlocalhost.example.com/photo.png")
    ).toBe(true);
    // `localhost` as a label, not as the whole name.
    expect(isSafeStoryImageUrl("https://localhost.example.com/a.png")).toBe(
      true
    );
  });

  it("bounds URL length before fetching", () => {
    expect(
      isSafeStoryImageUrl(`https://cdn.example.com/${"a".repeat(2100)}.png`)
    ).toBe(false);
  });
});

describe("story OG image payload boundary", () => {
  it("accepts every supported raster container", () => {
    for (const [bytes, mime] of [
      [pngBytes(64, 48), "image/png"],
      [jpegBytes(320, 200), "image/jpeg"],
      [gifBytes(32, 32), "image/gif"],
      [webpBytes(300, 200), "image/webp"],
    ] as const) {
      const image = storyOgImageFromBytes(bytes);
      expect(image?.mimeType, mime).toBe(mime);
      expect(image?.dataUri).toMatch(
        new RegExp(`^data:${mime.replace("/", "\\/")};base64,`)
      );
    }
  });

  it("rejects a small file that declares an excessive canvas", () => {
    // 33 bytes, 30000x30000: inside the byte ceiling, catastrophic for the
    // renderer. The ceiling has to come from the container header.
    const bomb = pngHeaderOnly(30_000, 30_000);
    expect(bomb.byteLength).toBeLessThan(MAX_STORY_OG_IMAGE_BYTES);
    expect(storyOgImageFromBytes(bomb)).toBeNull();
  });

  it("rejects canvases over the side and total pixel ceilings", () => {
    expect(
      storyOgImageFromBytes(pngHeaderOnly(MAX_STORY_OG_IMAGE_SIDE + 1, 4))
    ).toBeNull();
    expect(
      storyOgImageFromBytes(pngHeaderOnly(4, MAX_STORY_OG_IMAGE_SIDE + 1))
    ).toBeNull();
    const side = Math.floor(Math.sqrt(MAX_STORY_OG_IMAGE_PIXELS)) + 1;
    expect(side).toBeLessThan(MAX_STORY_OG_IMAGE_SIDE);
    expect(storyOgImageFromBytes(pngHeaderOnly(side, side))).toBeNull();
  });

  it("rejects truncated and garbage-tailed payloads so the fallback is used", () => {
    // Header-valid, garbage tail: this used to render as an empty gray panel.
    expect(storyOgImageFromBytes(Uint8Array.from(PNG_SIGNATURE))).toBeNull();
    const truncated = PNG_BYTES.subarray(0, PNG_BYTES.byteLength - 20);
    expect(storyOgImageFromBytes(truncated)).toBeNull();
    const padded = new Uint8Array(PNG_BYTES.byteLength + 32);
    padded.set(PNG_BYTES, 0);
    expect(storyOgImageFromBytes(padded)).toBeNull();
    const gif = gifBytes(16, 16);
    expect(
      storyOgImageFromBytes(gif.subarray(0, gif.byteLength - 1))
    ).toBeNull();
  });

  it("rejects a real repository image that is truncated mid-stream", async () => {
    const png = new Uint8Array(await readFile("public/logo.png"));
    expect(storyOgImageFromBytes(png)).not.toBeNull();
    for (const keep of [0.25, 0.5, 0.75]) {
      const cut = png.subarray(0, Math.floor(png.byteLength * keep));
      expect(storyOgImageFromBytes(cut), `keep=${keep}`).toBeNull();
    }
  });

  it("keeps the byte ceiling unchanged", () => {
    expect(MAX_STORY_OG_IMAGE_BYTES).toBe(1_000_000);
    expect(
      storyOgImageFromBytes(new Uint8Array(MAX_STORY_OG_IMAGE_BYTES + 1))
    ).toBeNull();
  });

  it("never leaks the source URL or query into the inlined data", () => {
    const image = storyOgImageFromBytes(PNG_BYTES);
    expect(image?.dataUri).not.toContain("cdn.example.com");
    expect(image?.dataUri).not.toContain("secret");
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

  it("rejects a header-valid but truncated body over the wire", async () => {
    await expect(
      fetchStoryOgImage("https://cdn.example.com/photo.png", {
        fetcher: async () =>
          new Response(PNG_BYTES.subarray(0, 30), {
            headers: { "content-type": "image/png" },
          }),
      })
    ).resolves.toBeNull();
  });

  it("rejects a small body that declares an excessive canvas", async () => {
    await expect(
      fetchStoryOgImage("https://cdn.example.com/photo.png", {
        fetcher: async () =>
          new Response(pngHeaderOnly(30_000, 30_000), {
            headers: { "content-type": "image/png" },
          }),
      })
    ).resolves.toBeNull();
  });

  it("clamps the abort timeout into the supported window", async () => {
    vi.useFakeTimers();
    try {
      // A fetcher that only ever settles via its abort signal.
      const hanging = async (_input: unknown, init?: RequestInit) => {
        const signal = init?.signal;
        if (!signal) throw new Error("expected an abort signal");
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      };

      const low = fetchStoryOgImage("https://cdn.example.com/photo.png", {
        fetcher: hanging as unknown as typeof fetch,
        timeoutMs: 1,
      });
      // 1ms is below the floor, so the abort must not fire before the floor.
      await vi.advanceTimersByTimeAsync(MIN_STORY_IMAGE_TIMEOUT_MS - 1);
      expect(await Promise.race([low, Promise.resolve("pending")])).toBe(
        "pending"
      );
      await vi.advanceTimersByTimeAsync(1);
      await expect(low).resolves.toBeNull();

      // 60s is above the ceiling, so the abort must fire at the ceiling.
      const high = fetchStoryOgImage("https://cdn.example.com/photo.png", {
        fetcher: hanging as unknown as typeof fetch,
        timeoutMs: 60_000,
      });
      await vi.advanceTimersByTimeAsync(4_999);
      expect(await Promise.race([high, Promise.resolve("pending")])).toBe(
        "pending"
      );
      await vi.advanceTimersByTimeAsync(1);
      await expect(high).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never issues a request for an unsafe URL", async () => {
    let called = false;
    await fetchStoryOgImage("https://localhost./photo.png", {
      fetcher: async () => {
        called = true;
        return new Response(PNG_BYTES);
      },
    });
    expect(called).toBe(false);
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

  it("uses the branded fallback when a payload would have rendered blank", () => {
    // A truncated body is a miss, so the card must fall back rather than ship
    // an empty gray photo panel.
    const truncated = PNG_BYTES.subarray(0, PNG_BYTES.byteLength - 20);
    expect(storyOgImageFromBytes(truncated)).toBeNull();
    const html = renderToStaticMarkup(storyOgCard(item(), null, "en"));
    expect(html).not.toContain("<img");
    expect(html).toContain("AI NEWS");
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

  it("carries the ellipsis clamp that bounds the headline", () => {
    const html = renderToStaticMarkup(storyOgCard(item(), null, "en"));
    expect(html).toContain("text-overflow:ellipsis");
    // The clamp and the ellipsis must stay together: without the ellipsis
    // satori ignores the line clamp entirely.
    expect(html).toContain("-webkit-line-clamp:4");
    expect(html).toContain("-webkit-box-orient:vertical");
    expect(html).toContain(`max-height:${STORY_OG_TITLE_MAX_HEIGHT}px`);
  });

  it("reserves a title band larger than the clamped headline", () => {
    expect(STORY_OG_TITLE_MAX_HEIGHT).toBeLessThanOrEqual(
      STORY_OG_TITLE_BAND_HEIGHT
    );
    expect(STORY_OG_TITLE_BAND_TOP).toBeGreaterThan(0);
  });
});
