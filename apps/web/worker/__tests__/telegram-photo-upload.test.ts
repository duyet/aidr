/**
 * Telegram could not fetch a story photo by URL (AIDR-28/29): the Worker
 * downloads it and uploads the bytes before the story falls back to text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportDeliveryFailure } from "../bugsink.js";
import { hydrateStory, type StoryRow } from "../notify/index.js";
import { telegramNotifier } from "../notify/telegram.js";
import type { Env } from "../types.js";

vi.mock("../bugsink.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../bugsink.js")>()),
  reportDeliveryFailure: vi.fn(async () => {}),
}));

const ENV = { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat" } as Env;
const IMAGE = "https://img.example/pics/lead.jpg?sig=secret-token&w=1200";
const URL_REJECTED = {
  ok: false,
  error_code: 400,
  description: "Bad Request: failed to get HTTP URL content",
};

const row = (over: Partial<StoryRow> = {}): StoryRow => ({
  id: "ae6e4921aa22bb33cc44dd55ee66ff77",
  url: "https://example.com/story",
  title: "A story",
  summary: "A summary.",
  image_url: IMAGE,
  media_manifest: null,
  category: "llm",
  points: 10,
  comments: 2,
  rank_score: 30,
  llm_importance: 9,
  lang: "en",
  ...over,
});

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status });
const posted = (id = 7) => json({ ok: true, result: { message_id: id } });
const jpeg = (bytes = 2048, headers: Record<string, string> = {}) =>
  new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": "image/jpeg", ...headers },
  });

interface Call {
  url: string;
  method: string;
  init: RequestInit;
}

/** Telegram answers come from `telegram` in order; any other URL is the
 *  image host and answers with `image`. */
function stubNetwork(opts: { telegram: Response[]; image?: () => Response }) {
  const telegram = [...opts.telegram];
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      const isTelegram = url.startsWith("https://api.telegram.org/");
      calls.push({
        url,
        method: isTelegram ? (url.split("/").pop() as string) : "image",
        init,
      });
      if (isTelegram) {
        const next = telegram.shift();
        if (!next) throw new Error(`unexpected Telegram call: ${url}`);
        return next;
      }
      if (!opts.image) throw new Error(`unexpected image fetch: ${url}`);
      return opts.image();
    })
  );
  return calls;
}

const methods = (calls: Call[]) => calls.map((call) => call.method);

beforeEach(() => vi.mocked(reportDeliveryFailure).mockClear());
afterEach(() => vi.unstubAllGlobals());

describe("story photo upload after a URL fetch rejection", () => {
  it("uploads the downloaded image and posts the story once", async () => {
    const calls = stubNetwork({
      telegram: [json(URL_REJECTED, 400), posted(55)],
      image: () => jpeg(),
    });

    const result = await telegramNotifier.sendStory(ENV, hydrateStory(row()));

    expect(result).toMatchObject({ ok: true, messageId: "55" });
    expect(methods(calls)).toEqual(["sendPhoto", "image", "sendPhoto"]);
    const upload = calls[2]?.init.body;
    expect(upload).toBeInstanceOf(FormData);
    const form = upload as FormData;
    expect(form.get("chat_id")).toBe("chat");
    expect(form.get("photo")).toBeInstanceOf(Blob);
    expect(String(form.get("caption"))).toContain("A story");
    expect(JSON.parse(String(form.get("reply_markup")))).toHaveProperty(
      "inline_keyboard"
    );
    expect(result.error).toBe(
      "fallback ok: sendPhoto:Bad Request: failed to get HTTP URL content"
    );
  });

  it("falls back to text with every reason kept when the download fails too", async () => {
    const calls = stubNetwork({
      telegram: [json(URL_REJECTED, 400), posted(56)],
      image: () => new Response("forbidden", { status: 403 }),
    });

    const result = await telegramNotifier.sendStory(ENV, hydrateStory(row()));

    expect(result).toMatchObject({ ok: true, messageId: "56" });
    expect(methods(calls)).toEqual(["sendPhoto", "image", "sendMessage"]);
    expect(result.error).toBe(
      "fallback ok: sendPhoto:Bad Request: failed to get HTTP URL content; upload:download_http_403; photo:none_sent"
    );
  });

  it("falls back to text when the upload is rejected as well", async () => {
    const calls = stubNetwork({
      telegram: [
        json(URL_REJECTED, 400),
        json(
          {
            ok: false,
            error_code: 400,
            description: "Bad Request: IMAGE_PROCESS_FAILED",
          },
          400
        ),
        posted(57),
      ],
      image: () => jpeg(),
    });

    const result = await telegramNotifier.sendStory(ENV, hydrateStory(row()));

    expect(result).toMatchObject({ ok: true, messageId: "57" });
    expect(methods(calls)).toEqual([
      "sendPhoto",
      "image",
      "sendPhoto",
      "sendMessage",
    ]);
    expect(result.error).toContain(
      "sendPhoto(upload):Bad Request: IMAGE_PROCESS_FAILED; photo:none_sent"
    );
  });

  it("never sends again after an upload with no usable answer", async () => {
    const calls = stubNetwork({
      telegram: [
        json(URL_REJECTED, 400),
        new Response("<html>502</html>", { status: 502 }),
      ],
      image: () => jpeg(),
    });

    const result = await telegramNotifier.sendStory(ENV, hydrateStory(row()));

    expect(result).toMatchObject({ ok: false, ambiguous: true });
    expect(methods(calls)).toEqual(["sendPhoto", "image", "sendPhoto"]);
  });

  it("does not download when Telegram's answer is not about the URL", async () => {
    const calls = stubNetwork({
      telegram: [
        json(
          {
            ok: false,
            error_code: 400,
            description: "Bad Request: chat not found",
          },
          400
        ),
        posted(58),
      ],
    });

    await telegramNotifier.sendStory(ENV, hydrateStory(row()));

    expect(methods(calls)).toEqual(["sendPhoto", "sendMessage"]);
  });

  it("does not download when the first send has no usable answer", async () => {
    const calls = stubNetwork({
      telegram: [new Response("<html>502</html>", { status: 502 })],
    });

    const result = await telegramNotifier.sendStory(ENV, hydrateStory(row()));

    expect(result).toMatchObject({ ok: false, ambiguous: true });
    expect(methods(calls)).toEqual(["sendPhoto"]);
  });

  it.each([
    [
      "not an image",
      () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      "upload:not_a_photo",
    ],
    [
      "over the upload cap",
      () => jpeg(16, { "content-length": String(11 * 1024 * 1024) }),
      "upload:too_large",
    ],
    ["empty", () => jpeg(0), "upload:empty"],
  ])(
    "skips the upload when the download is %s",
    async (_name, image, reason) => {
      const calls = stubNetwork({
        telegram: [json(URL_REJECTED, 400), posted(59)],
        image,
      });

      const result = await telegramNotifier.sendStory(ENV, hydrateStory(row()));

      expect(methods(calls)).toEqual(["sendPhoto", "image", "sendMessage"]);
      expect(result.error).toContain(reason);
    }
  );

  it("stops reading a body that outgrows the cap without a content-length", async () => {
    const chunk = new Uint8Array(4 * 1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
    });
    const calls = stubNetwork({
      telegram: [json(URL_REJECTED, 400), posted(60)],
      image: () =>
        new Response(stream, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
    });

    const result = await telegramNotifier.sendStory(ENV, hydrateStory(row()));

    expect(methods(calls)).toEqual(["sendPhoto", "image", "sendMessage"]);
    expect(result.error).toContain("upload:too_large");
  });

  it("does not follow a redirect to a private host", async () => {
    const calls = stubNetwork({
      telegram: [json(URL_REJECTED, 400), posted(61)],
      image: () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://169.254.169.254/latest/meta-data" },
        }),
    });

    const result = await telegramNotifier.sendStory(ENV, hydrateStory(row()));

    expect(methods(calls)).toEqual(["sendPhoto", "image", "sendMessage"]);
    expect(result.error).toContain("upload:download_failed");
  });

  it("keeps image URLs and their query strings out of logs and Bugsink", async () => {
    stubNetwork({
      telegram: [json(URL_REJECTED, 400), posted(62)],
      image: () => new Response("nope", { status: 500 }),
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warns = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await telegramNotifier.sendStory(ENV, hydrateStory(row()));

    const everything = JSON.stringify([
      errors.mock.calls,
      warns.mock.calls,
      vi.mocked(reportDeliveryFailure).mock.calls,
      result,
    ]);
    expect(everything).not.toContain("secret-token");
    expect(everything).not.toContain("sig=");
    expect(everything).not.toContain("lead.jpg");
    expect(reportDeliveryFailure).toHaveBeenCalledTimes(1);
    errors.mockRestore();
    warns.mockRestore();
  });
});
