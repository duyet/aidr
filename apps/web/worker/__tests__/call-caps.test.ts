import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateTldr,
  scoreItems,
  TRANSLATE_BATCH_SIZE,
  translateItems,
} from "../llm.js";
import {
  DIGEST_MAX_BULLETS,
  NOTIFY_MAX_ATTEMPTS,
  TRENDING_MAX_PER_DAY,
  TRENDING_MIN_GAP_SEC,
  trendingBudget,
} from "../notify/index.js";
import { storyPhotoUrls } from "../notify/telegram.js";
import type { StoryPayload } from "../notify/types.js";
import {
  planVideoDelivery,
  TELEGRAM_ALBUM_MAX_ITEMS,
} from "../notify/video.js";
import type { Env } from "../types.js";

/**
 * Hard caps on paid or externally visible calls per run (#147). Each test
 * fails if a change makes one run fan out further: LLM spend and Telegram
 * posts are the two places a bug turns into money or channel spam.
 */

const env: Env = {
  DB: {} as D1Database,
  NEWS_INGEST: {} as Workflow,
  ANYROUTER_BASE_URL: "https://anyrouter.test/api/v1",
  ANYROUTER_MODEL: "test-model",
  ANYROUTER_API_KEY: "test-key",
  NEWS_ADMIN_TOKEN: "test-token",
};

function chat(content: string): Response {
  const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  return new Response(
    `${frame({ choices: [{ delta: { content } }] })}data: [DONE]\n\n`,
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LLM call caps per run", () => {
  const scoreItemsList = Array.from({ length: 12 }, (_, i) => ({
    i,
    title: `t${i}`,
    source: "s",
  }));

  it("scores in batches of 5: exactly one call per batch when the model answers", async () => {
    const fetchMock = vi.fn(async (url: unknown, init: unknown) => {
      if (String(url).includes("/systemone")) {
        return new Response("down", { status: 500 });
      }
      const body = JSON.parse((init as { body: string }).body) as {
        messages: { content: string }[];
      };
      const prompt = body.messages.map((m) => m.content).join("\n");
      const ids = [...prompt.matchAll(/\{"i":(\d+),"title"/g)].map((m) =>
        Number(m[1])
      );
      return chat(
        JSON.stringify({
          results: ids.map((i) => ({
            i,
            relevance: 0.9,
            importance: 5,
            quality: 5,
            category: "Models",
            tags: ["a", "b", "c"],
          })),
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await scoreItems(env, scoreItemsList);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    // System One is tried once per item, then chat once per batch of 5.
    expect(urls.filter((u) => u.includes("/systemone"))).toHaveLength(12);
    expect(urls.filter((u) => !u.includes("/systemone"))).toHaveLength(3);
  });

  it("bounds score retries when the model never answers usefully", async () => {
    const fetchMock = vi.fn(async (url: unknown) =>
      String(url).includes("/systemone")
        ? new Response("down", { status: 500 })
        : chat('{"results":[]}')
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await scoreItems(env, scoreItemsList);
    const chatCalls = fetchMock.mock.calls.filter(
      (c) => !String(c[0]).includes("/systemone")
    );
    // 3 batches x at most 5 attempts each; never a per-item chat fan-out.
    expect(chatCalls.length).toBeLessThanOrEqual(3 * 5);
  });

  it("translates in batches of TRANSLATE_BATCH_SIZE", async () => {
    const fetchMock = vi.fn(async (_u: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        messages: { content: string }[];
      };
      const prompt = body.messages.map((m) => m.content).join("\n");
      const ids = [...prompt.matchAll(/"i":(\d+)/g)].map((m) => Number(m[1]));
      return chat(
        JSON.stringify({
          results: ids.map((i) => ({ i, title: `vi${i}`, summary: "x" })),
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const items = Array.from({ length: 7 }, (_, i) => ({
      i,
      title: `t${i}`,
      summary: "s",
      sourceLang: "en" as const,
    }));
    await translateItems(env, items);
    expect(fetchMock).toHaveBeenCalledTimes(
      Math.ceil(items.length / TRANSLATE_BATCH_SIZE)
    );
  });

  it("does not call the model for Vietnamese-source items", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await translateItems(env, [
      { i: 0, title: "tin", summary: "s", sourceLang: "vi" as const },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up on the TL;DR after two attempts", async () => {
    const fetchMock = vi.fn(async () => chat("no json"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await generateTldr(env, [{ id: "1", title: "Story" }]);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
    expect(result.error).toBeTruthy();
  });
});

describe("Telegram caps per run", () => {
  it("pins the digest and retry ceilings", () => {
    expect(DIGEST_MAX_BULLETS).toBe(8);
    expect(NOTIFY_MAX_ATTEMPTS).toBe(3);
    expect(TRENDING_MAX_PER_DAY).toBe(6);
    expect(TELEGRAM_ALBUM_MAX_ITEMS).toBe(10);
  });

  it("allows at most one trending post per run", () => {
    const now = Date.UTC(2026, 0, 1, 12);
    expect(trendingBudget(0, null, now)).toBe(1);
  });

  it("stops trending posts at the daily cap", () => {
    const now = Date.UTC(2026, 0, 1, 12);
    expect(trendingBudget(TRENDING_MAX_PER_DAY, null, now)).toBe(0);
  });

  it("respects the minimum gap between posts", () => {
    const now = Date.UTC(2026, 0, 1, 12);
    const recent = now - (TRENDING_MIN_GAP_SEC - 1) * 1000;
    expect(trendingBudget(1, recent, now)).toBe(0);
  });

  const story = (assets: unknown[]) =>
    ({
      id: "abcdef1234567890",
      url: "https://example.com/story",
      title: "T",
      summary: "S",
      image_url: null,
      category: "llm",
      points: 0,
      comments: 0,
      rank_score: 1,
      llm_importance: 9,
      lang: "vi",
      media_manifest: { version: 1, assets },
    }) as StoryPayload;

  it("caps a photo album at the Telegram limit", () => {
    const assets = Array.from({ length: 25 }, (_, i) => ({
      type: "image",
      url: `https://img.example/${i}.jpg`,
    }));
    expect(storyPhotoUrls(story(assets)).length).toBeLessThanOrEqual(
      TELEGRAM_ALBUM_MAX_ITEMS
    );
  });

  it("probes at most 3 videos and posts nothing while planning", async () => {
    const fetchMock = vi.fn(
      async (_url: unknown) => new Response("nope", { status: 404 })
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const assets = Array.from({ length: 8 }, (_, i) => ({
      type: "video",
      url: `https://cdn.example/clip${i}.mp4`,
    }));
    await planVideoDelivery(story(assets));
    const origins = new Set(
      fetchMock.mock.calls.map((c) => new URL(String(c[0])).pathname)
    );
    expect(origins.size).toBeLessThanOrEqual(3);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain("api.telegram.org");
    }
  });
});
