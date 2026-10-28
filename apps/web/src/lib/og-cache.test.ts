import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cachedOgResponse,
  DAY_OG_RENDER_VERSION,
  dayOgObjectKey,
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
