import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertNotifyConfig,
  buildMaxRankQuery,
  buildTrendingQuery,
  classifyDigestSkip,
  classifyTrendingSkip,
  DIGEST_LOCAL_HOUR,
  digestKey,
  hydrateStory,
  localDayStartMs,
  NOTIFY_MAX_ATTEMPTS,
  shouldSendDigest,
  TRENDING_MAX_PER_DAY,
  TRENDING_MIN_GAP_SEC,
  TRENDING_MIN_IMPORTANCE,
  TRENDING_MIN_RANK,
  trendingBudget,
} from "../notify/index.js";
import {
  buildDigestMessage,
  buildDigestReplyMarkup,
  buildStoryCaption,
  buildStoryReplyMarkup,
  DIGEST_LINK_PREVIEW,
  escapeHtml,
  STORY_PHOTO_LINK_PREVIEW,
  STORY_TEXT_LINK_PREVIEW,
  storyImageCount,
  storyPhotoUrl,
  storyUrl,
  telegramChatId,
  telegramEnNotifier,
  telegramNotifier,
  withUtm,
} from "../notify/telegram.js";
import type { DailyDigest, StoryPayload } from "../notify/types.js";
import { digestEvent, storyEvent } from "../notify/webhook.js";
import { checkIvCaption, TELEGRAM_IV_LIMITS } from "../telegram-iv.js";
import type { Env } from "../types.js";

afterEach(() => vi.unstubAllGlobals());

const story = (over: Partial<StoryPayload> = {}): StoryPayload => ({
  id: "abcdef1234567890",
  url: "https://example.com/story?a=1&b=2",
  title: "GPT-6 <beats> humans & robots",
  summary: "A summary.",
  image_url: null,
  category: "llm",
  points: 120,
  comments: 45,
  rank_score: 30,
  llm_importance: 9,
  ...over,
  lang: over.lang ?? "vi",
});

describe("digest gating", () => {
  it("never sends before the local send hour", () => {
    expect(shouldSendDigest(null, DIGEST_LOCAL_HOUR - 1)).toBe(false);
    expect(shouldSendDigest(null, DIGEST_LOCAL_HOUR)).toBe(true);
  });

  it("sends only once per day: a sent row blocks resending", () => {
    expect(shouldSendDigest({ status: "sent", attempts: 1 }, 12)).toBe(false);
  });

  it("retries failed sends up to the attempt cap", () => {
    expect(shouldSendDigest({ status: "failed", attempts: 1 }, 12)).toBe(true);
    expect(
      shouldSendDigest({ status: "failed", attempts: NOTIFY_MAX_ATTEMPTS }, 12)
    ).toBe(false);
  });

  it("keys the digest by local date", () => {
    expect(digestKey("2026-08-17")).toBe("digest:2026-08-17");
  });
});

describe("trendingBudget", () => {
  const now = 1_700_000_000_000;
  it("stops at the daily cap", () => {
    expect(trendingBudget(TRENDING_MAX_PER_DAY, null, now)).toBe(0);
  });
  it("enforces the minimum gap since the last post", () => {
    expect(
      trendingBudget(0, now - (TRENDING_MIN_GAP_SEC - 60) * 1000, now)
    ).toBe(0);
    expect(
      trendingBudget(0, now - (TRENDING_MIN_GAP_SEC + 60) * 1000, now)
    ).toBe(1);
  });
  it("allows at most one trending post per run", () => {
    expect(trendingBudget(0, null, now)).toBe(1);
  });
});

describe("buildTrendingQuery", () => {
  it("requires published, high-rank, high-importance, unposted items", () => {
    const { sql, binds } = buildTrendingQuery("telegram", 1_700_000_000_000);
    expect(sql).toContain("status = 'published'");
    expect(sql).toContain("n.item_id IS NULL");
    expect(sql).toContain("tr.lang = 'vi'");
    expect(sql).toContain("THEN 'vi' ELSE 'en' END AS lang");
    expect(sql).toContain("i.media_manifest");
    expect(binds).toEqual([
      "telegram",
      1_700_000_000 - 24 * 3600,
      TRENDING_MIN_RANK,
      TRENDING_MIN_IMPORTANCE,
    ]);
  });

  it("keeps the English channel on source copy, never the Vietnamese translation", () => {
    const { sql } = buildTrendingQuery("telegram-en", 1_700_000_000_000, "en");
    expect(sql).toContain("'en' AS lang");
    expect(sql).not.toContain("tr.lang = 'vi'");
    expect(sql).not.toContain("THEN 'vi'");
  });
});

describe("localDayStartMs", () => {
  it("returns local midnight for a UTC+7 timezone", () => {
    // 2026-08-17T03:30:00Z = 10:30 local in Asia/Ho_Chi_Minh
    const now = Date.UTC(2026, 7, 17, 3, 30, 0);
    // local midnight = 2026-08-16T17:00:00Z
    expect(localDayStartMs(now, "Asia/Ho_Chi_Minh")).toBe(
      Date.UTC(2026, 7, 16, 17, 0, 0)
    );
  });
});

describe("digest message", () => {
  const digest: DailyDigest = {
    lang: "vi",
    date: "2026-08-17",
    bullets: [
      {
        text: "OpenAI <ships> GPT-6 & more",
        url: "https://aidr.today/abcdef12",
      },
      { text: "No-link bullet", url: null },
    ],
  };

  it("renders linked and unlinked bullets with escaped HTML", () => {
    const msg = buildDigestMessage(digest);
    expect(msg).toContain("AI hôm nay có gì — 2026-08-17");
    expect(msg).toContain("OpenAI &lt;ships&gt; GPT-6 &amp; more");
    expect(msg).toContain("lang=vi&amp;utm_source=telegram");
    expect(msg).toContain("•  No-link bullet");
  });

  it("uses English header and button copy when the digest falls back to EN", () => {
    const english: DailyDigest = {
      lang: "en",
      date: "2026-08-17",
      bullets: [{ text: "English bullet", url: "https://aidr.today/abcdef12" }],
    };
    expect(buildDigestMessage(english)).toContain("AI news today");
    expect(buildDigestMessage(english)).toContain("lang=en");
    const markup = buildDigestReplyMarkup("en") as {
      inline_keyboard: { text: string; url: string }[][];
    };
    expect(markup.inline_keyboard[0][0].text).toContain("full digest");
    expect(markup.inline_keyboard[0][0].url).toContain("lang=en");
  });

  it("drops overflow bullets to stay under the message cap", () => {
    const big: DailyDigest = {
      lang: "vi",
      date: "2026-08-17",
      bullets: Array.from({ length: 100 }, (_, i) => ({
        text: `bullet ${i} ${"x".repeat(200)}`,
        url: null,
      })),
    };
    expect(buildDigestMessage(big).length).toBeLessThan(4096);
  });
});

describe("trending story message", () => {
  it("escapes HTML and includes title, summary and meta", () => {
    const caption = buildStoryCaption(story());
    expect(caption).toContain("🔥 GPT-6 &lt;beats&gt; humans &amp; robots");
    expect(caption).toContain("A summary.");
    expect(caption).toContain("#llm");
    expect(caption).toContain("▲ 120");
    expect(caption).toContain("💬 45");
  });

  it("truncates long summaries under Telegram's caption limit", () => {
    const caption = buildStoryCaption(story({ summary: "x".repeat(2000) }));
    expect(caption.length).toBeLessThan(1024);
    expect(caption).toContain("…");
  });

  it("keeps a long title plus a long summary inside the 1024-char caption cap", () => {
    // The title is part of the same caption, so a headline-heavy story used
    // to be the one shape that could blow the limit.
    const caption = buildStoryCaption(
      story({ title: "T".repeat(5_000), summary: "s".repeat(5_000) })
    );
    expect(checkIvCaption(caption).ok).toBe(true);
    expect(caption.length).toBeLessThanOrEqual(TELEGRAM_IV_LIMITS.captionChars);
  });

  it("states the extra image count instead of silently shipping one photo", () => {
    const multi = story({
      media_manifest: {
        version: 1,
        assets: [
          { type: "image", url: "https://img.example/a.jpg" },
          { type: "image", url: "https://img.example/b.jpg" },
          { type: "image", url: "https://img.example/c.jpg" },
        ],
      },
    });
    expect(storyImageCount(multi)).toBe(3);
    // The Vietnamese-first adapter copy, since the fixture resolves to `vi`.
    expect(buildStoryCaption(multi)).toContain("+2 ảnh nữa");
    expect(buildStoryCaption({ ...multi, lang: "en" })).toContain("+2 more");
  });

  it("says nothing about extra images for a single-image story", () => {
    const single = story({
      image_url: "https://img.example/only.jpg",
      media_manifest: null,
    });
    expect(storyImageCount(single)).toBe(1);
    expect(buildStoryCaption(single)).not.toContain("more");
    const none = story({ image_url: null, media_manifest: null });
    expect(storyImageCount(none)).toBe(0);
    expect(buildStoryCaption(none)).not.toContain("more");
  });

  it("prefers the generated card over the manifest thumbnail", () => {
    const withManifest = story({
      image_url: null,
      media_manifest: {
        version: 1,
        assets: [{ type: "image", url: "https://img.example/poster.jpg" }],
      },
    });
    expect(storyPhotoUrl(withManifest)).toBe(
      "https://aidr.today/api/og/abcdef12.png?lang=vi"
    );
    expect(storyPhotoUrl(story({ lang: "en" }))).toBe(
      "https://aidr.today/api/og/abcdef12.png?lang=en"
    );
  });

  it("builds Read + AI;DR buttons with UTM tracking", () => {
    const markup = buildStoryReplyMarkup(story()) as {
      inline_keyboard: { text: string; url: string }[][];
    };
    const [row] = markup.inline_keyboard;
    expect(row[0].url).toContain("https://example.com/story");
    expect(row[0].url).toContain("utm_source=telegram");
    expect(row[1].url).toBe(
      "https://aidr.today/abcdef12?lang=vi&utm_source=telegram"
    );
  });

  it("uses English story controls and links when translation is absent", () => {
    const markup = buildStoryReplyMarkup(story({ lang: "en" })) as {
      inline_keyboard: { text: string; url: string }[][];
    };
    expect(markup.inline_keyboard[0][0].text).toBe("Read →");
    expect(markup.inline_keyboard[0][1].url).toContain("lang=en");
  });

  it("uses the 8-char permalink with an explicit stable locale", () => {
    expect(storyUrl({ id: "abcdef1234567890" })).toBe(
      "https://aidr.today/abcdef12?lang=vi"
    );
    expect(storyUrl({ id: "abcdef1234567890" }, "en")).toBe(
      "https://aidr.today/abcdef12?lang=en"
    );
  });
});

describe("webhook locale links", () => {
  it("uses the canonical Vietnamese permalink without a category segment", () => {
    const event = storyEvent(story());
    expect(event.links?.at(-1)?.url).toBe(
      "https://aidr.today/abcdef12?lang=vi"
    );
  });

  it("supports an explicitly English webhook payload", () => {
    const event = storyEvent(story({ lang: "en" }));
    expect(event.links?.at(-1)?.url).toBe(
      "https://aidr.today/abcdef12?lang=en"
    );
  });

  it("normalizes digest links to the digest language", () => {
    const event = digestEvent({
      lang: "vi",
      date: "2026-08-17",
      bullets: [{ text: "Tin", url: "https://aidr.today/abcdef12" }],
    });
    expect(event.links?.[0].url).toBe("https://aidr.today/?lang=vi");
    expect(event.links?.[1].url).toBe("https://aidr.today/abcdef12?lang=vi");

    const english = digestEvent({
      lang: "en",
      date: "2026-08-17",
      bullets: [{ text: "Story", url: "https://aidr.today/abcdef12" }],
    });
    expect(english.title).toBe("AI news digest — 2026-08-17");
    expect(english.links?.[1].url).toBe("https://aidr.today/abcdef12?lang=en");
  });
});

describe("telegram channels", () => {
  it("sends English to @aidr_today and leaves the Vietnamese chat id alone", () => {
    expect(telegramEnNotifier.lang).toBe("en");
    expect(telegramEnNotifier.id).toBe("telegram-en");
    const enEnv = {
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_EN_CHAT_ID: "@aidr_today",
    } as Env;
    expect(telegramEnNotifier.target(enEnv)).toBe("@aidr_today");
    expect(telegramChatId(enEnv, "en").source).toBe("TELEGRAM_EN_CHAT_ID");
    expect(telegramNotifier.lang).toBe("vi");
    expect(
      telegramNotifier.target({ TELEGRAM_VI_CHAT_ID: "-100" } as Env)
    ).toBe("-100");
    expect(telegramNotifier.target({ TELEGRAM_CHAT_ID: "-100" } as Env)).toBe(
      "-100"
    );
    expect(
      telegramNotifier.target({
        TELEGRAM_VI_CHAT_ID: "-100",
        TELEGRAM_EN_CHAT_ID: "@aidr_today",
      } as Env)
    ).not.toBe("@aidr_today");
    expect(telegramEnNotifier.enabled(enEnv)).toBe(true);
    expect(telegramEnNotifier.enabled({ TELEGRAM_BOT_TOKEN: "t" } as Env)).toBe(
      false
    );
    expect(telegramEnNotifier.enabled({} as Env)).toBe(false);
  });

  it("posts the English digest to @aidr_today", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 3 } }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    await telegramEnNotifier.sendDigest(
      {
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_EN_CHAT_ID: "@aidr_today",
        TELEGRAM_VI_CHAT_ID: "-100",
      } as Env,
      {
        lang: "en",
        date: "2026-08-17",
        bullets: [{ text: "English only", url: null }],
      }
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.chat_id).toBe("@aidr_today");
    expect(body.text).toContain("AI news today");
    expect(body.text).not.toContain("AI hôm nay");
    expect(body.text).not.toContain("-100");
  });
});

describe("telegramNotifier gating", () => {
  it("is disabled unless both token and chat id are set", () => {
    expect(telegramNotifier.enabled({} as Env)).toBe(false);
    expect(telegramNotifier.enabled({ TELEGRAM_BOT_TOKEN: "t" } as Env)).toBe(
      false
    );
    expect(
      telegramNotifier.enabled({
        TELEGRAM_BOT_TOKEN: "t",
        TELEGRAM_CHAT_ID: "-100",
      } as Env)
    ).toBe(true);
  });

  it("falls back to text ONCE when the photo call fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, description: "bad photo" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await telegramNotifier.sendStory(
      {
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_CHAT_ID: "chat",
      } as Env,
      story()
    );
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("7");
    // Exactly two calls: one failed photo, one text. No second photo retry.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/sendPhoto");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/sendMessage");
  });

  it("attaches the generated first-party card, never the upstream thumb", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 9 } }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await telegramNotifier.sendStory(
      {
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_CHAT_ID: "chat",
      } as Env,
      story({ image_url: "https://img.example/hotlink-hostile.png" })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.photo).toBe("https://aidr.today/api/og/abcdef12.png?lang=vi");
    expect(body.photo).not.toContain("hotlink-hostile");
  });

  it("disables the link preview on the photo path so the card is the only image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 10 } }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    await telegramNotifier.sendStory(
      { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat" } as Env,
      story()
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.link_preview_options).toEqual(STORY_PHOTO_LINK_PREVIEW);
    expect(body.link_preview_options).toEqual({ is_disabled: true });
  });

  it("sets link_preview_options explicitly on the digest and text fallback", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, result: { message_id: 11 } }), {
          status: 200,
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await telegramNotifier.sendDigest(
      { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat" } as Env,
      { lang: "vi", date: "2026-08-17", bullets: [] }
    );
    const digestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(digestBody.link_preview_options).toEqual(DIGEST_LINK_PREVIEW);
    expect(digestBody.link_preview_options).toEqual({ is_disabled: true });

    // Force the text path: an id with no card shape and no usable thumbnail.
    await telegramNotifier.sendStory(
      { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat" } as Env,
      story({ id: "NOT-HEX", image_url: "http://127.0.0.1/x.jpg" })
    );
    const textBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(textBody.link_preview_options).toEqual(STORY_TEXT_LINK_PREVIEW);
    expect(textBody.link_preview_options).toEqual({ is_disabled: true });
  });

  it("throws when chat id is set but the bot token is missing", () => {
    expect(() =>
      telegramNotifier.enabled({ TELEGRAM_CHAT_ID: "-100" } as Env)
    ).toThrow(/TELEGRAM_CHAT_ID is set but TELEGRAM_BOT_TOKEN is missing/);
    expect(() =>
      telegramNotifier.enabled({
        TELEGRAM_CHAT_ID: "-100",
        TELEGRAM_BOT_TOKEN: "   ",
      } as Env)
    ).toThrow(/TELEGRAM_BOT_TOKEN is missing/);
  });
});

describe("assertNotifyConfig", () => {
  it("allows fully unset or fully set telegram", () => {
    expect(() => assertNotifyConfig({} as Env)).not.toThrow();
    expect(() =>
      assertNotifyConfig({
        TELEGRAM_BOT_TOKEN: "t",
        TELEGRAM_CHAT_ID: "-100",
      } as Env)
    ).not.toThrow();
  });

  it("fails loud when telegram is half-configured", () => {
    expect(() =>
      assertNotifyConfig({ TELEGRAM_CHAT_ID: "-100" } as Env)
    ).toThrow(/TELEGRAM_BOT_TOKEN is missing/);
  });
});

describe("helpers", () => {
  it("hydrates notifications from a normalized manifest, not stale image_url", () => {
    const base = story({
      image_url: "https://img.example/stale.jpg?utm_source=old",
    });
    const hydrated = hydrateStory({
      ...base,
      media_manifest: JSON.stringify({
        version: 1,
        assets: [
          {
            type: "video",
            url: "https://example.com/story.mp4",
            poster_url: "https://img.example/poster.jpg",
          },
        ],
      }),
    } as Parameters<typeof hydrateStory>[0]);
    expect(hydrated.image_url).toBe("https://img.example/poster.jpg");
    expect(hydrated.media_manifest?.assets[0]).toMatchObject({
      type: "video",
      poster_url: "https://img.example/poster.jpg",
    });
  });

  it("drops generic legacy logos before Telegram delivery", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 8 } }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    // No card shape, so the photo path has nothing usable and the adapter
    // falls through to the single text message.
    const result = await telegramNotifier.sendStory(
      {
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_CHAT_ID: "chat",
      } as Env,
      story({ id: "NOTHEX", image_url: "https://img.example/favicon.png" })
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/sendMessage");
  });

  it("falls back to a video poster when the id cannot address a card", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 12 } }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await telegramNotifier.sendStory(
      { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat" } as Env,
      story({
        id: "NOTHEX",
        image_url: null,
        media_manifest: {
          version: 1,
          assets: [
            {
              type: "video",
              url: "https://example.com/story.mp4",
              poster_url: "https://img.example/poster.jpg",
            },
          ],
        },
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.photo).toBe("https://img.example/poster.jpg");
  });

  it("drops private/tracking legacy image URLs when no manifest is usable", () => {
    const base = story({
      url: "https://example.com/story",
      image_url: "http://127.0.0.1/private.jpg",
    });
    const hydrated = hydrateStory({
      ...base,
      media_manifest: "[]",
    } as Parameters<typeof hydrateStory>[0]);
    expect(hydrated.image_url).toBeNull();
  });

  it("escapes ampersands first", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
  it("keeps invalid URLs unchanged in withUtm", () => {
    expect(withUtm("not a url")).toBe("not a url");
  });
});

describe("classifyDigestSkip", () => {
  it("returns before_hour before the local send hour", () => {
    expect(classifyDigestSkip(null, DIGEST_LOCAL_HOUR - 1)).toBe("before_hour");
  });
  it("returns already_sent for a sent row", () => {
    expect(classifyDigestSkip({ status: "sent", attempts: 1 }, 12)).toBe(
      "already_sent"
    );
  });
  it("returns null when a digest should go out", () => {
    expect(classifyDigestSkip(null, 12)).toBeNull();
    expect(
      classifyDigestSkip({ status: "failed", attempts: 1 }, 12)
    ).toBeNull();
  });
});

describe("classifyTrendingSkip", () => {
  it("reports below_min_rank when the live max is under the bar", () => {
    expect(classifyTrendingSkip(16.93, 1, 0)).toBe("below_min_rank");
  });
  it("reports budget_zero before looking at rank", () => {
    expect(classifyTrendingSkip(30, 0, 0)).toBe("budget_zero");
  });
  it("reports none_unposted when rank clears the bar but nothing is left", () => {
    expect(classifyTrendingSkip(30, 1, 0)).toBe("none_unposted");
  });
  it("returns null when a candidate may be sent", () => {
    expect(classifyTrendingSkip(30, 1, 2)).toBeNull();
  });
});

describe("buildMaxRankQuery", () => {
  it("selects MAX(rank_score) over the published 24h window", () => {
    const { sql, binds } = buildMaxRankQuery(1_700_000_000_000);
    expect(sql).toContain("MAX(rank_score)");
    expect(sql).toContain("status = 'published'");
    expect(binds).toEqual([1_700_000_000 - 24 * 3600]);
  });
});

describe("trending thresholds", () => {
  it("TRENDING_MIN_RANK is 20 — lowered to allow more viral posts", () => {
    expect(TRENDING_MIN_RANK).toBe(20);
  });
  it("TRENDING_MAX_PER_DAY is 6 — allow up to 6 trending posts per day", () => {
    expect(TRENDING_MAX_PER_DAY).toBe(6);
  });
});
