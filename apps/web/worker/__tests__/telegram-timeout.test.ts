import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sendDayVideoToTelegram,
  TELEGRAM_MEDIA_TIMEOUT_MS,
  TELEGRAM_TEXT_TIMEOUT_MS,
  telegramTimeoutMs,
} from "../notify/telegram.js";
import type { Env } from "../types.js";

/**
 * AIDR-8/9: the digest `sendPhoto` was aborted at 15s while Telegram was
 * still downloading the on-demand digest card, leaving the post's outcome
 * unknown. Media sent by URL gets a longer wait; an abort stays ambiguous and
 * is never followed by a second send, so a slow call cannot double-post.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const env = { TELEGRAM_BOT_TOKEN: "t" } as unknown as Env;
const post = {
  date: "2026-10-10",
  lang: "en",
  youtubeId: "abc",
  title: null,
} as const;

describe("telegram call timeouts", () => {
  it("waits longer for media fetched by URL than for text", () => {
    expect(TELEGRAM_MEDIA_TIMEOUT_MS).toBeGreaterThan(TELEGRAM_TEXT_TIMEOUT_MS);
    for (const method of ["sendPhoto", "sendMediaGroup", "sendVideo"]) {
      expect(telegramTimeoutMs(method)).toBe(TELEGRAM_MEDIA_TIMEOUT_MS);
    }
    expect(telegramTimeoutMs("sendMessage")).toBe(TELEGRAM_TEXT_TIMEOUT_MS);
  });

  it("gives sendPhoto the media timeout and ends the send on an abort", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn(async () => {
      throw new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError"
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendDayVideoToTelegram(env, "chat", post);

    expect(timeout).toHaveBeenCalledWith(TELEGRAM_MEDIA_TIMEOUT_MS);
    expect(result.ok).toBe(false);
    expect(result.ambiguous).toBe(true);
    // No text fallback after an unknown outcome: the photo may be posted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives the text fallback the text timeout after a definite rejection", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: false, description: "Bad Request: wrong file" }),
          {
            status: 400,
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }))
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendDayVideoToTelegram(env, "chat", post);

    expect(result).toEqual({ ok: true, messageId: "7" });
    expect(timeout.mock.calls.map((c) => c[0])).toEqual([
      TELEGRAM_MEDIA_TIMEOUT_MS,
      TELEGRAM_TEXT_TIMEOUT_MS,
    ]);
  });
});
