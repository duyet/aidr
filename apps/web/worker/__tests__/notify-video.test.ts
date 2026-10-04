import { afterEach, describe, expect, it, vi } from "vitest";
import { telegramNotifier } from "../notify/telegram.js";
import type { StoryPayload } from "../notify/types.js";
import {
  isMp4Container,
  parseMoovDuration,
  probeVideo,
  TELEGRAM_VIDEO_MAX_SECONDS,
} from "../notify/video.js";
import type { Env } from "../types.js";

afterEach(() => vi.unstubAllGlobals());

const env = { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat" } as Env;

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(payload, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function ftyp(brand = "isom"): Uint8Array {
  return box(
    "ftyp",
    concat(new TextEncoder().encode(brand), new Uint8Array(4))
  );
}

function moov(seconds: number): Uint8Array {
  const mvhd = new Uint8Array(100);
  const dv = new DataView(mvhd.buffer);
  dv.setUint32(12, 1000); // timescale
  dv.setUint32(16, seconds * 1000); // duration
  return box("moov", box("mvhd", mvhd));
}

/** Only the 8-byte header of a 3 MB `moov`; the body is never served. */
function hugeMoovHeader(): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setUint32(0, 3 * 1024 * 1024);
  out.set(new TextEncoder().encode("moov"), 4);
  return out;
}

/** Synthetic MP4. `faststart` puts moov before a (fake) 1 MB mdat. */
function mp4(seconds: number, faststart: boolean, brand = "isom"): Uint8Array {
  const mdat = box("mdat", new Uint8Array(1024 * 1024));
  return faststart
    ? concat(ftyp(brand), moov(seconds), mdat)
    : concat(ftyp(brand), mdat, moov(seconds));
}

interface Origin {
  file: Uint8Array;
  type?: string;
  ranges?: boolean;
  /** Overrides the reported total, to model a huge file without allocating. */
  total?: number;
  /** Non-2xx answer for every request, to model a hotlink-blocked origin. */
  status?: number;
}

/** Fetch stub: Range-aware media origins plus a recording Telegram endpoint. */
function stubFetch(
  origins: Record<string, Origin>,
  telegram: (
    method: string,
    body: Record<string, unknown>
  ) => unknown = () => ({
    ok: true,
    result: { message_id: 5 },
  })
) {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const mock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.telegram.org/")) {
      const body = JSON.parse(init?.body as string);
      calls.push({ url, body });
      const method = url.split("/").pop() as string;
      return new Response(JSON.stringify(telegram(method, body)), {
        status: 200,
      });
    }
    calls.push({ url });
    const origin = origins[url];
    if (!origin) return new Response("nope", { status: 404 });
    if (origin.status) return new Response("denied", { status: origin.status });
    const headers: Record<string, string> = {
      "content-type": origin.type ?? "video/mp4",
    };
    const total = origin.total ?? origin.file.length;
    const range = new Headers(init?.headers).get("range");
    if (range && origin.ranges !== false) {
      const [, a, b] = range.match(/bytes=(\d+)-(\d+)/) as RegExpMatchArray;
      const start = Number(a);
      const end = Math.min(Number(b), origin.file.length - 1);
      headers["content-range"] = `bytes ${start}-${end}/${total}`;
      return new Response(
        origin.file.slice(start, end + 1) as unknown as BodyInit,
        {
          status: 206,
          headers,
        }
      );
    }
    headers["content-length"] = String(total);
    return new Response(origin.file as unknown as BodyInit, {
      status: 200,
      headers,
    });
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock, tg: () => calls.filter((c) => c.body) };
}

const story = (assets: unknown[], over: Partial<StoryPayload> = {}) =>
  ({
    id: "abcdef1234567890",
    url: "https://example.com/story",
    title: "Title",
    summary: "Sum",
    image_url: null,
    category: "llm",
    points: 0,
    comments: 0,
    rank_score: 1,
    llm_importance: 9,
    lang: "vi",
    media_manifest: { version: 1, assets },
    ...over,
  }) as StoryPayload;

const VIDEO = "https://cdn.example/clip.mp4";

describe("MP4 duration parser", () => {
  it("reads mvhd duration and rejects QuickTime", () => {
    expect(parseMoovDuration(moov(42))).toBe(42);
    expect(isMp4Container(mp4(1, true))).toBe(true);
    expect(isMp4Container(mp4(1, true, "qt  "))).toBe(false);
  });
});

describe("probeVideo", () => {
  it("finds duration when moov is first (faststart)", async () => {
    stubFetch({ [VIDEO]: { file: mp4(30, true) } });
    expect(await probeVideo(VIDEO)).toMatchObject({
      ok: true,
      durationSeconds: 30,
    });
  });

  it("finds duration when moov trails mdat, with a bounded hop count", async () => {
    const { calls } = stubFetch({ [VIDEO]: { file: mp4(30, false) } });
    expect(await probeVideo(VIDEO)).toMatchObject({ ok: true });
    // Head window + a 16-byte header hop + one moov read; never the whole file.
    expect(calls.length).toBeLessThanOrEqual(4);
  });

  it.each([
    ["oversized", { file: mp4(5, true), total: 25 * 1024 * 1024 }],
    ["not_mp4", { file: mp4(5, true), type: "video/webm" }],
    ["not_mp4", { file: mp4(5, true, "qt  ") }],
    ["too_long", { file: mp4(TELEGRAM_VIDEO_MAX_SECONDS + 1, true) }],
    ["duration_unknown", { file: mp4(5, false), ranges: false }],
    // The header says MP4 but the bytes are a web page: the MIME type is the
    // origin's claim, so the container is checked too.
    ["not_mp4", { file: new TextEncoder().encode("<html>login</html>") }],
    // A `moov` over the 2 MB read bound is not downloaded to learn the length.
    [
      "duration_unknown",
      { file: concat(ftyp(), hugeMoovHeader()), total: 4 * 1024 * 1024 },
    ],
  ] as const)("skips with reason %s", async (reason, origin) => {
    stubFetch({ [VIDEO]: origin });
    expect(await probeVideo(VIDEO)).toMatchObject({ ok: false, reason });
  });

  it.each([
    ["loopback", "http://127.0.0.1/clip.mp4"],
    ["cloud metadata", "http://169.254.169.254/latest/meta-data"],
    ["private LAN", "https://10.0.0.5/clip.mp4"],
  ])("refuses a redirect to a %s host", async (_name, location) => {
    // A public URL that passes the URL check can still redirect the Worker
    // into a private network (SSRF). Every hop is checked, so the probe stops
    // at the redirect and never requests the private address.
    const mock = vi.fn(
      async (_input: string | URL) =>
        new Response(null, { status: 302, headers: { location } })
    );
    vi.stubGlobal("fetch", mock);
    expect(await probeVideo(VIDEO)).toMatchObject({
      ok: false,
      reason: "unreachable",
    });
    expect(mock.mock.calls.map((c) => String(c[0]))).toEqual([VIDEO]);
  });

  it.each([
    [
      "a 206 with no total in Content-Range",
      () =>
        new Response(mp4(5, true).slice(0, 1024) as unknown as BodyInit, {
          status: 206,
          headers: {
            "content-type": "video/mp4",
            "content-range": "bytes 0-1023/*",
          },
        }),
    ],
    [
      "a 200 with no Content-Length",
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(mp4(5, true).slice(0, 1024));
              controller.close();
            },
          }),
          { status: 200, headers: { "content-type": "video/mp4" } }
        ),
    ],
  ])("skips with size_unknown on %s", async (_name, respond) => {
    // Telegram refuses a URL video over 20 MB. If the origin will not say how
    // big the file is, the cap cannot be proven, so the video is not sent.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond())
    );
    expect(await probeVideo(VIDEO)).toMatchObject({
      ok: false,
      reason: "size_unknown",
    });
  });

  it("stops at the head window when the server ignores Range", async () => {
    // A server that answers 200 to a Range request would stream the whole
    // file. The probe must not read it: it takes the head window, refuses the
    // second full-body answer, and reports the duration as unknown.
    const file = mp4(5, false);
    let served = 0;
    const mock = vi.fn(async () => {
      let at = 0;
      return new Response(
        new ReadableStream({
          pull(controller) {
            const chunk = file.slice(at, at + 64 * 1024);
            at += chunk.length;
            served += chunk.length;
            if (chunk.length > 0) controller.enqueue(chunk);
            else controller.close();
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "content-length": String(file.length),
          },
        }
      );
    });
    vi.stubGlobal("fetch", mock);
    expect(await probeVideo(VIDEO)).toMatchObject({
      ok: false,
      reason: "duration_unknown",
    });
    expect(mock).toHaveBeenCalledTimes(2);
    expect(file.length).toBeGreaterThan(1024 * 1024);
    expect(served).toBeLessThan(512 * 1024);
  });

  it("never fetches an unsafe URL", async () => {
    const { mock } = stubFetch({});
    for (const url of [
      "http://127.0.0.1/a.mp4",
      "https://user:pw@cdn.example/a.mp4",
      "https://cdn.example:8443/a.mp4",
      "http://cdn.example/a.mp4",
    ]) {
      expect((await probeVideo(url)).ok).toBe(false);
    }
    expect(mock).not.toHaveBeenCalled();
  });
});

describe("Telegram video delivery", () => {
  const poster = "https://img.example/poster.jpg";

  it("sends a video-only story with sendVideo and the Read button", async () => {
    const f = stubFetch({ [VIDEO]: { file: mp4(30, true) } });
    const result = await telegramNotifier.sendStory(
      env,
      story([{ type: "video", url: VIDEO, poster_url: poster }])
    );
    expect(result).toEqual({ ok: true, messageId: "5" });
    expect(f.tg()).toHaveLength(1);
    const { url, body } = f.tg()[0];
    expect(url).toContain("/sendVideo");
    expect(body).toMatchObject({
      video: VIDEO,
      duration: 30,
      supports_streaming: true,
      parse_mode: "HTML",
    });
    expect(body?.reply_markup).toBeDefined();
    expect(String(body?.caption ?? "")).not.toContain("<a href");
    // The poster is not a legal thumbnail (not probed as JPEG <=320px here).
    expect(body?.thumbnail).toBeUndefined();
  });

  it("sends image + video as one album: video, poster, then the rest", async () => {
    const f = stubFetch({ [VIDEO]: { file: mp4(30, true) } });
    await telegramNotifier.sendStory(
      env,
      story([
        { type: "image", url: "https://img.example/a.jpg" },
        { type: "video", url: VIDEO, poster_url: poster },
        { type: "image", url: "https://img.example/b.jpg?w=200" },
        { type: "image", url: "https://img.example/b.jpg?w=800" },
      ])
    );
    expect(f.tg()).toHaveLength(1);
    const album = f.tg()[0];
    expect(album.url).toContain("/sendMediaGroup");
    const media = album.body?.media as Array<Record<string, unknown>>;
    expect(media.map((m) => [m.type, m.media])).toEqual([
      ["video", VIDEO],
      ["photo", poster],
      ["photo", "https://img.example/a.jpg"],
      ["photo", "https://img.example/b.jpg?w=200"],
    ]);
    expect(media[0]).toMatchObject({ parse_mode: "HTML", duration: 30 });
    expect(String(media[0].caption)).toContain("<a href=");
    expect(String(media[0].caption)).toContain("utm_source=telegram");
    expect(media[1].caption).toBeUndefined();
    expect(album.body?.reply_markup).toBeUndefined();
  });

  it("supports a mixed album of two videos and a photo", async () => {
    const other = "https://cdn.example/two.mp4";
    const f = stubFetch({
      [VIDEO]: { file: mp4(10, true) },
      [other]: { file: mp4(20, false) },
    });
    await telegramNotifier.sendStory(
      env,
      story([
        { type: "video", url: VIDEO },
        { type: "video", url: other },
        { type: "image", url: "https://img.example/a.jpg" },
      ])
    );
    const media = f.tg()[0].body?.media as Array<{ type: string }>;
    expect(media.map((m) => m.type)).toEqual(["video", "video", "photo"]);
  });

  it("dedupes the same video by identity, not URL string", async () => {
    const f = stubFetch({ [VIDEO]: { file: mp4(10, true) } });
    await telegramNotifier.sendStory(
      env,
      story([
        { type: "video", url: VIDEO },
        { type: "video", url: `${VIDEO}?w=200` },
      ])
    );
    expect(f.tg()[0].url).toContain("/sendVideo");
  });

  it("falls back to the poster photo when the video is over the byte cap", async () => {
    const f = stubFetch({
      [VIDEO]: { file: mp4(10, true), total: 30 * 1024 * 1024 },
    });
    await telegramNotifier.sendStory(
      env,
      story([{ type: "video", url: VIDEO, poster_url: poster }])
    );
    expect(f.tg()).toHaveLength(1);
    expect(f.tg()[0].url).toContain("/sendPhoto");
    expect(f.tg()[0].body?.photo).toBe(poster);
  });

  it("falls back to text when over duration and there is no poster", async () => {
    const f = stubFetch({
      [VIDEO]: { file: mp4(TELEGRAM_VIDEO_MAX_SECONDS + 5, true) },
    });
    await telegramNotifier.sendStory(
      env,
      story([{ type: "video", url: VIDEO }], { id: "NOTHEX" })
    );
    expect(f.tg().map((c) => c.url.split("/").pop())).toEqual(["sendMessage"]);
  });

  it("never fetches or sends an unsafe video URL", async () => {
    const f = stubFetch({});
    await telegramNotifier.sendStory(
      env,
      story([
        { type: "video", url: "http://127.0.0.1/a.mp4", poster_url: poster },
      ])
    );
    expect(f.calls.some((c) => c.url.includes("127.0.0.1"))).toBe(false);
    expect(JSON.stringify(f.tg())).not.toContain("127.0.0.1");
  });

  it("drops the whole album when it needs more than 10 items", async () => {
    const f = stubFetch({ [VIDEO]: { file: mp4(10, true) } });
    const images = Array.from({ length: 11 }, (_, i) => ({
      type: "image",
      url: `https://img.example/${i}.jpg`,
    }));
    await telegramNotifier.sendStory(
      env,
      story([{ type: "video", url: VIDEO }, ...images])
    );
    const media = f.tg()[0].body?.media as Array<{ type: string }> | undefined;
    // Never a partial group: no video item, and the video was not sent.
    expect(f.tg().some((c) => c.url.includes("/sendVideo"))).toBe(false);
    expect(media?.some((m) => m.type === "video") ?? false).toBe(false);
  });

  it("drops the whole album when video bytes exceed the album budget", async () => {
    const urls = ["a", "b", "c"].map((n) => `https://cdn.example/${n}.mp4`);
    const f = stubFetch(
      Object.fromEntries(
        urls.map((u) => [u, { file: mp4(5, true), total: 15 * 1024 * 1024 }])
      )
    );
    await telegramNotifier.sendStory(
      env,
      story(urls.map((url) => ({ type: "video", url })))
    );
    expect(f.tg().some((c) => c.url.includes("/sendMediaGroup"))).toBe(false);
    expect(f.tg().some((c) => c.url.includes("/sendVideo"))).toBe(false);
  });

  it("falls back once, without double-posting, when sendVideo returns ok:false", async () => {
    const f = stubFetch({ [VIDEO]: { file: mp4(10, true) } }, (method) =>
      method === "sendVideo"
        ? { ok: false, description: "wrong file identifier" }
        : { ok: true, result: { message_id: 9 } }
    );
    const result = await telegramNotifier.sendStory(
      env,
      story([{ type: "video", url: VIDEO, poster_url: poster }])
    );
    expect(result).toEqual({ ok: true, messageId: "9" });
    expect(f.tg().map((c) => c.url.split("/").pop())).toEqual([
      "sendVideo",
      "sendPhoto",
    ]);
  });

  it("does not fall back after a non-JSON Telegram body", async () => {
    // The Bot API always answers in JSON, even for errors. An HTML 502/504
    // comes from a proxy in front of it, which cannot know whether Telegram
    // already took the request. That is an unknown outcome, not a rejection,
    // so a fallback here could post the story twice.
    const f = stubFetch({ [VIDEO]: { file: mp4(10, true) } });
    const inner = (globalThis.fetch as unknown as typeof fetch).bind(
      globalThis
    );
    const sendVideo = vi.fn(
      async () => new Response("<html>bad gateway</html>", { status: 502 })
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) =>
        String(input).includes("/sendVideo") ? sendVideo() : inner(input, init)
      )
    );
    const result = await telegramNotifier.sendStory(
      env,
      story([{ type: "video", url: VIDEO }])
    );
    expect(result).toMatchObject({ ok: false, ambiguous: true });
    expect(result.error).toContain("HTTP 502");
    expect(sendVideo).toHaveBeenCalledTimes(1);
    expect(f.tg()).toHaveLength(0);
  });

  // Telegram downloads the media itself, so the 15 s call can time out or the
  // connection can drop AFTER Telegram accepted the post. Sending again, by
  // any transport, would put the same story in the channel twice.
  const timeout = () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  };
  const methods = (f: ReturnType<typeof stubFetch>) =>
    f.tg().map((c) => c.url.split("/").pop());

  it.each([
    ["times out", timeout],
    [
      "loses the connection",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("sends nothing else when sendVideo %s", async (_name, fail) => {
    const f = stubFetch({ [VIDEO]: { file: mp4(10, true) } }, (method) =>
      method === "sendVideo" ? fail() : { ok: true, result: { message_id: 9 } }
    );
    const result = await telegramNotifier.sendStory(
      env,
      story([{ type: "video", url: VIDEO, poster_url: poster }])
    );
    expect(result).toMatchObject({ ok: false, ambiguous: true });
    expect(methods(f)).toEqual(["sendVideo"]);
  });

  it("sends nothing else when the video album times out", async () => {
    const f = stubFetch({ [VIDEO]: { file: mp4(10, true) } }, (method) =>
      method === "sendMediaGroup"
        ? timeout()
        : { ok: true, result: { message_id: 9 } }
    );
    const result = await telegramNotifier.sendStory(
      env,
      story([
        { type: "video", url: VIDEO, poster_url: poster },
        { type: "image", url: "https://img.example/a.jpg" },
      ])
    );
    expect(result).toMatchObject({ ok: false, ambiguous: true });
    expect(methods(f)).toEqual(["sendMediaGroup"]);
  });

  it("sends a video album as one message and does not send a follow-up", async () => {
    // The album is the only Telegram call. A follow-up reply used to time
    // out after the album was posted and turn the send into a retry.
    const f = stubFetch({ [VIDEO]: { file: mp4(10, true) } }, () => ({
      ok: true,
      result: [{ message_id: 9 }],
    }));
    const result = await telegramNotifier.sendStory(
      env,
      story([
        { type: "video", url: VIDEO },
        { type: "image", url: "https://img.example/a.jpg" },
      ])
    );
    expect(result).toEqual({ ok: true, messageId: "9" });
    expect(methods(f)).toEqual(["sendMediaGroup"]);
    const media = f.tg()[0].body?.media as Array<{ caption?: string }>;
    expect(media[0]?.caption).toContain("<a href=");
    expect(media[0]?.caption).toContain("utm_source=telegram");
  });

  it("sends the video without a thumbnail when the poster is hotlink-blocked", async () => {
    // A poster the Worker cannot read cannot be proven to be a legal Bot API
    // thumbnail (JPEG, 200 KB, 320 px). Passing it anyway would make Telegram
    // reject the whole video, so it is left out and the video still goes.
    const f = stubFetch({
      [VIDEO]: { file: mp4(10, true) },
      [poster]: { file: new Uint8Array(8), type: "image/jpeg", status: 403 },
    });
    const result = await telegramNotifier.sendStory(
      env,
      story([{ type: "video", url: VIDEO, poster_url: poster }])
    );
    expect(result.ok).toBe(true);
    expect(methods(f)).toEqual(["sendVideo"]);
    expect(f.tg()[0].body?.thumbnail).toBeUndefined();
  });

  it("posts once with the poster when the video is hotlink-blocked", async () => {
    // A CDN that answers 403 to the Worker will answer 403 to Telegram too.
    // The video is skipped before any send, so the fallback is the only post.
    const f = stubFetch({
      [VIDEO]: { file: mp4(10, true), status: 403 },
    });
    const result = await telegramNotifier.sendStory(
      env,
      story([{ type: "video", url: VIDEO, poster_url: poster }])
    );
    expect(result.ok).toBe(true);
    expect(methods(f)).toEqual(["sendPhoto"]);
    expect(f.tg()[0].body?.photo).toBe(poster);
  });

  it("uses locale-aware links in the album caption", async () => {
    const f = stubFetch({ [VIDEO]: { file: mp4(10, true) } });
    await telegramNotifier.sendStory(
      env,
      story(
        [
          { type: "video", url: VIDEO },
          { type: "image", url: "https://img.example/a.jpg" },
        ],
        { lang: "en" }
      )
    );
    expect(methods(f)).not.toContain("sendMessage");
    const media = f.tg()[0].body?.media as Array<{ caption?: string }>;
    const caption = media[0]?.caption ?? "";
    expect(caption).toContain("lang=en");
    expect(caption).toContain("utm_source=telegram");
    expect(caption).toContain(">Read →</a>");
  });

  it("leaves a no-video story byte-identical to the photo path", async () => {
    const f = stubFetch({});
    await telegramNotifier.sendStory(
      env,
      story([{ type: "image", url: "https://img.example/a.jpg" }])
    );
    expect(f.calls).toHaveLength(1);
    expect(f.tg()[0].url).toContain("/sendPhoto");
  });
});
