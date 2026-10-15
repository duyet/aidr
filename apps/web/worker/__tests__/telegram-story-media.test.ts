/**
 * A trending post always goes out, and never with the first-party share
 * card. These replay the story shapes that #804's first round dropped (a
 * story with no usable image and a publisher URL the preview rule refused)
 * and the album that one GIF used to collapse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportDeliveryFailure } from "../bugsink.js";
import { MAX_MEDIA_URL_LENGTH } from "../media.js";
import { hydrateStory, type StoryRow } from "../notify/index.js";
import { telegramNotifier } from "../notify/telegram.js";
import type { Env } from "../types.js";

vi.mock("../bugsink.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../bugsink.js")>()),
  reportDeliveryFailure: vi.fn(async () => {}),
}));

const ENV = { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat" } as Env;

const row = (over: Partial<StoryRow> = {}): StoryRow => ({
  id: "e549b0f1aa22bb33cc44dd55ee66ff77",
  url: "https://example.com/story",
  title: "A story",
  summary: "A summary.",
  image_url: null,
  media_manifest: null,
  category: "llm",
  points: 10,
  comments: 2,
  rank_score: 30,
  llm_importance: 9,
  lang: "en",
  ...over,
});

function stubTelegram(
  answer: object = { ok: true, result: { message_id: 7 } }
) {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(answer), { status: 200 })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const calls = (fetchMock: ReturnType<typeof stubTelegram>) =>
  fetchMock.mock.calls.map((call) => {
    const [url, init] = call as unknown as [string, RequestInit];
    return {
      method: url.split("/").pop(),
      body: JSON.parse(String(init.body)),
    };
  });

beforeEach(() => vi.mocked(reportDeliveryFailure).mockClear());
afterEach(() => vi.unstubAllGlobals());

describe("an imageless story is never lost", () => {
  it("posts an http publisher page as the preview", async () => {
    const fetchMock = stubTelegram();
    const story = hydrateStory(
      row({ url: "http://richg42.blogspot.com/2026/10/bc7-encoder.html" })
    );

    const result = await telegramNotifier.sendStory(ENV, story);

    expect(result).toMatchObject({ ok: true, messageId: "7" });
    const [text] = calls(fetchMock);
    expect(calls(fetchMock)).toHaveLength(1);
    expect(text?.method).toBe("sendMessage");
    expect(text?.body.link_preview_options).toEqual({
      url: "http://richg42.blogspot.com/2026/10/bc7-encoder.html",
      prefer_large_media: true,
      show_above_text: true,
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(/api\/og/);
  });

  it("posts text with the preview off when the publisher URL canonicalizes to empty", async () => {
    // An overlong URL hydrates to "" (`canonicalizeMediaUrl` -> null). The
    // aidr page cannot stand in: its og:image is the share card.
    const fetchMock = stubTelegram();
    const story = hydrateStory(
      row({
        url: `https://example.com/${"a".repeat(MAX_MEDIA_URL_LENGTH)}`,
      })
    );
    expect(story.url).toBe("");

    const result = await telegramNotifier.sendStory(ENV, story);

    expect(result).toMatchObject({ ok: true, messageId: "7" });
    expect(result.error).toBe(
      "fallback ok: photo:no_usable_image; preview:no_publisher_url"
    );
    const sent = calls(fetchMock);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe("sendMessage");
    expect(sent[0]?.body.link_preview_options).toEqual({ is_disabled: true });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(/api\/og/);
    expect(reportDeliveryFailure).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportDeliveryFailure).mock.calls[0]?.[2]).toEqual({
      channel: "telegram",
      kind: "story_media",
    });
  });

  it("reports a story whose text fallback Telegram refused too", async () => {
    stubTelegram({ ok: false, description: "Bad Request: chat not found" });

    const result = await telegramNotifier.sendStory(ENV, hydrateStory(row()));

    expect(result.ok).toBe(false);
    expect(reportDeliveryFailure).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportDeliveryFailure).mock.calls[0]?.[1]).toContain(
      "photo:no_usable_image"
    );
  });
});

describe("an album drops only the items Telegram cannot take", () => {
  const manifest = (urls: string[]) =>
    JSON.stringify({
      assets: urls.map((url) => ({ type: "image", url })),
    });

  it("sends the album without the GIF", async () => {
    const fetchMock = stubTelegram({ ok: true, result: [{ message_id: 8 }] });
    const story = hydrateStory(
      row({
        media_manifest: manifest([
          "https://img.example/one.jpg",
          "https://img.example/loop.gif",
          "https://img.example/two.png",
        ]),
      })
    );

    const result = await telegramNotifier.sendStory(ENV, story);

    expect(result).toMatchObject({ ok: true, messageId: "8" });
    const sent = calls(fetchMock);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe("sendMediaGroup");
    expect(
      sent[0]?.body.media.map((item: { media: string }) => item.media)
    ).toEqual(["https://img.example/one.jpg", "https://img.example/two.png"]);
    expect(sent[0]?.body.media[0].caption).toBeTruthy();
    expect(result.error).toBe(
      "fallback ok: gallery:image:unsupported_type:gif"
    );
  });

  it("sends one photo when the GIF leaves a single image", async () => {
    const fetchMock = stubTelegram();
    const story = hydrateStory(
      row({
        media_manifest: manifest([
          "https://img.example/loop.gif",
          "https://img.example/one.jpg",
        ]),
      })
    );

    const result = await telegramNotifier.sendStory(ENV, story);

    expect(result).toMatchObject({ ok: true, messageId: "7" });
    const sent = calls(fetchMock);
    expect(sent.map((call) => call.method)).toEqual(["sendPhoto"]);
    expect(sent[0]?.body.photo).toBe("https://img.example/one.jpg");
  });
});
