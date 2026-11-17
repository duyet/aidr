import { afterEach, describe, expect, it, vi } from "vitest";
import { pngFromPixels } from "./__fixtures__/raster";
import { DAY_OG_HEIGHT, DAY_OG_WIDTH } from "./day-og";
import {
  cachedOgResponse,
  DAY_OG_RENDER_VERSION,
  dayOgObjectKey,
  putDayCardObject,
  validateDayCardPng,
} from "./og-cache";
import { storyOgObjectKey, storyOgStaticKey } from "./story-og";
import type { FeedItem } from "./types";

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "abcdef12deadbeef",
    url: "https://publisher.example.com/story",
    title: "A useful AI story",
    title_vi: null,
    summary: "A short summary.",
    summary_vi: null,
    category: "Research",
    published_at: 1_790_268_030,
    points: 82,
    comments: 144,
    rank_score: 1,
    source_id: "fixture",
    tags: [],
    sources: [],
    llm_tokens: 0,
    image_url: "https://cdn.example.com/photo.png",
    ...overrides,
  };
}

/** In-memory stand-in for the R2 calls the cache makes. */
function memoryBucket() {
  const objects = new Map<
    string,
    { bytes: ArrayBuffer; customMetadata: Record<string, string> }
  >();
  const bucket = {
    async get(key: string) {
      const obj = objects.get(key);
      return obj
        ? { body: obj.bytes.slice(0), customMetadata: obj.customMetadata }
        : null;
    },
    async put(
      key: string,
      bytes: ArrayBuffer,
      opts: { customMetadata: Record<string, string> }
    ) {
      objects.set(key, { bytes, customMetadata: opts.customMetadata });
    },
  };
  return { bucket: bucket as unknown as R2Bucket, objects };
}

function png(): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    headers: { "Content-Type": "image/png" },
  });
}

const request = new Request("https://aidr.today/api/og/abcdef12.png");

describe("OG card keys", () => {
  // Each global version bump re-rendered the whole story archive, a quarter
  // of Worker CPU, even for day-card-only changes.
  it("keeps story card keys when the day card version changes", async () => {
    const dayUrl = new URL("https://aidr.today/api/og/date/2026-10-03.png");
    const story = await storyOgObjectKey(item(), "en");
    const nextDay = dayOgObjectKey(dayUrl, `${DAY_OG_RENDER_VERSION}-next`);
    expect(nextDay).not.toBe(dayOgObjectKey(dayUrl));
    expect(await storyOgObjectKey(item(), "en")).toBe(story);
    expect(story.startsWith("og-story/")).toBe(true);
    expect(nextDay.startsWith("og-day/")).toBe(true);
  });

  it("gives an edited title a new card", async () => {
    expect(
      await storyOgObjectKey(item({ title: "A corrected AI story" }), "en")
    ).not.toBe(await storyOgObjectKey(item(), "en"));
  });

  it("gives a late Vietnamese title a new Vietnamese card only", async () => {
    const late = item({ title_vi: "Một câu chuyện AI hữu ích" });
    expect(await storyOgObjectKey(late, "vi")).not.toBe(
      await storyOgObjectKey(item(), "vi")
    );
    expect(await storyOgObjectKey(late, "en")).toBe(
      await storyOgObjectKey(item(), "en")
    );
  });

  it("gives a newly added photo a new card", async () => {
    expect(await storyOgObjectKey(item({ image_url: null }), "en")).not.toBe(
      await storyOgObjectKey(item(), "en")
    );
  });

  // Ingest rewrites counts every 30 minutes, and the card no longer draws
  // them: a static card at an immutable URL must not depend on them.
  it("keeps the card whatever the counts are", async () => {
    expect(
      await storyOgObjectKey(item({ points: 500, comments: 900 }), "en")
    ).toBe(await storyOgObjectKey(item(), "en"));
    expect(await storyOgObjectKey(item({ points: 0, comments: 0 }), "en")).toBe(
      await storyOgObjectKey(item(), "en")
    );
  });

  // The Worker route writes its render on an R2 miss; the static card at
  // og.aidr.today is immutable, so the two must never share a key.
  it("keeps the Worker cache key apart from the static card key", async () => {
    const workerKey = await storyOgObjectKey(item(), "vi");
    const hash = workerKey.split("/")[1];
    expect(workerKey).toMatch(/^og-story\/[0-9a-f]{64}\/vi$/);
    expect(storyOgStaticKey(hash, "vi")).toBe(`og-story/${hash}/vi.png`);
    expect(storyOgStaticKey(hash, "vi")).not.toBe(workerKey);
  });
});

describe("cachedOgResponse", () => {
  afterEach(() => vi.useRealTimers());

  it("serves a content-keyed card from R2 with no expiry", async () => {
    const { bucket } = memoryBucket();
    const render = vi.fn(async () => png());
    await cachedOgResponse(request, undefined, render, { bucket, key: "k" });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 365 * 86_400_000);
    const res = await cachedOgResponse(request, undefined, render, {
      bucket,
      key: "k",
    });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(render).toHaveBeenCalledTimes(1);
  });

  // A failed photo fetch draws the branded fallback; content addressing
  // alone would keep that fallback forever.
  it("re-renders a card that asked for a bounded lifetime", async () => {
    const { bucket } = memoryBucket();
    const render = vi.fn(async () => ({ response: png(), maxAgeSec: 60 }));
    await cachedOgResponse(request, undefined, render, { bucket, key: "k" });
    await cachedOgResponse(request, undefined, render, { bucket, key: "k" });
    expect(render).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    await cachedOgResponse(request, undefined, render, { bucket, key: "k" });
    expect(render).toHaveBeenCalledTimes(2);
  });
});

describe("putDayCardObject", () => {
  afterEach(() => vi.useRealTimers());

  const DAY_KEY = "og-day/v1/api/og/date/2026-10-15.png/en";
  const card = () =>
    new Response(new Uint8Array([1, 2, 3]), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=600, s-maxage=3600",
      },
    });

  // The ingest pre-render step and the request path must write one object
  // shape, or a pre-rendered card would be fresh under different rules.
  it("writes the same bytes and metadata as the request path (bounded TTL)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T03:00:00Z"));
    const viaRequest = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
    } as unknown as R2Bucket;
    await cachedOgResponse(
      request,
      undefined,
      async () => ({ response: card(), maxAgeSec: 3600 }),
      { bucket: viaRequest, key: DAY_KEY }
    );
    const viaStep = {
      put: vi.fn(async () => undefined),
    } as unknown as R2Bucket;
    await putDayCardObject(viaStep, DAY_KEY, card(), 3600);
    expect(viaStep.put).toHaveBeenCalledTimes(1);
    expect(vi.mocked(viaStep.put).mock.calls[0]).toEqual(
      vi.mocked(viaRequest.put).mock.calls[0]
    );
  });

  it("writes the same bytes and metadata as the request path (no expiry)", async () => {
    const viaRequest = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
    } as unknown as R2Bucket;
    await cachedOgResponse(request, undefined, async () => card(), {
      bucket: viaRequest,
      key: DAY_KEY,
    });
    const viaStep = {
      put: vi.fn(async () => undefined),
    } as unknown as R2Bucket;
    await putDayCardObject(viaStep, DAY_KEY, card());
    expect(vi.mocked(viaStep.put).mock.calls[0]).toEqual(
      vi.mocked(viaRequest.put).mock.calls[0]
    );
    const options = vi.mocked(viaStep.put).mock.calls[0]?.[2] as {
      customMetadata: Record<string, string>;
    };
    expect(options.customMetadata.expiresAt).toBeUndefined();
  });
});

describe("validateDayCardPng", () => {
  /** A card-sized PNG with enough varied pixels to clear the size floor. */
  const cardPng = () =>
    pngFromPixels(DAY_OG_WIDTH, DAY_OG_HEIGHT, (x, y) => [
      (x * 7 + y * 13) & 0xff,
      (x + y * 3) & 0xff,
      (x * y) & 0xff,
    ]);

  it("accepts a whole card-sized PNG", () => {
    const bytes = cardPng();
    expect(bytes.byteLength).toBeGreaterThanOrEqual(10_000);
    expect(validateDayCardPng(bytes, DAY_OG_WIDTH, DAY_OG_HEIGHT)).toBe(true);
  });

  it("rejects a PNG of the wrong dimensions", () => {
    const bytes = pngFromPixels(600, 315, (x, y) => [
      (x * 7 + y * 13) & 0xff,
      (x + y * 3) & 0xff,
      (x * y) & 0xff,
    ]);
    expect(bytes.byteLength).toBeGreaterThanOrEqual(10_000);
    expect(validateDayCardPng(bytes, DAY_OG_WIDTH, DAY_OG_HEIGHT)).toBe(false);
  });

  it("rejects a header-only render at the size floor", () => {
    // Signature + the whole IHDR chunk, nothing after it: under the floor.
    const bytes = cardPng().slice(0, 33);
    expect(bytes.byteLength).toBeLessThan(2_000);
    expect(validateDayCardPng(bytes, DAY_OG_WIDTH, DAY_OG_HEIGHT)).toBe(false);
  });

  it("rejects a render truncated above the size floor, with a valid IHDR", () => {
    // The case the size floor cannot see: plenty of bytes, correct
    // dimensions, but the stream stops before IEND.
    const whole = cardPng();
    const bytes = whole.slice(0, whole.byteLength - 12);
    expect(bytes.byteLength).toBeGreaterThanOrEqual(2_000);
    expect(validateDayCardPng(bytes, DAY_OG_WIDTH, DAY_OG_HEIGHT)).toBe(false);
  });

  it("rejects a whole-sized body whose IEND CRC is corrupted", () => {
    const bytes = cardPng();
    bytes[bytes.byteLength - 1] ^= 0xff;
    expect(validateDayCardPng(bytes, DAY_OG_WIDTH, DAY_OG_HEIGHT)).toBe(false);
  });

  it("rejects bytes that are not a PNG at all", () => {
    expect(
      validateDayCardPng(
        new Uint8Array(20_000).fill(7),
        DAY_OG_WIDTH,
        DAY_OG_HEIGHT
      )
    ).toBe(false);
  });

  it("rejects a card-sized body with a corrupted signature", () => {
    const bytes = cardPng();
    bytes[0] = 0;
    expect(validateDayCardPng(bytes, DAY_OG_WIDTH, DAY_OG_HEIGHT)).toBe(false);
  });
});
