import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DAY_CARD_CANDIDATES,
  hasDayOgCopy,
  splitDayHighlights,
} from "../../src/lib/day-card-pick.js";
import { readSession } from "../../src/lib/db.js";
import { getDayArchive } from "../../src/lib/feed-queries.js";
import { dayCardVersion, loadDayCardPages } from "../notify/day-card.js";
import {
  assertNotifyConfig,
  buildRankWindowQuery,
  buildTrendingQuery,
  classifyDigestSkip,
  classifyTrendingSkip,
  DIGEST_LOCAL_HOUR,
  digestKey,
  hydrateStory,
  localDayStartMs,
  NOTIFY_MAX_ATTEMPTS,
  shouldSendDigest,
  TRENDING_BURST_MAX_PER_DAY,
  TRENDING_BURST_MIN_GAP_SEC,
  TRENDING_BURST_MIN_IMPORTANCE,
  TRENDING_MAX_PER_DAY,
  TRENDING_MIN_GAP_SEC,
  TRENDING_MIN_IMPORTANCE,
  TRENDING_RANK_FLOOR,
  TRENDING_RANK_PERCENTILE,
  trendingBudget,
  trendingImportanceFloor,
  trendingRankBar,
} from "../notify/index.js";
import {
  buildAlbumCaption,
  buildDigestCaption,
  buildDigestMessage,
  buildDigestReplyMarkup,
  buildStoryCaption,
  buildStoryReplyMarkup,
  digestMark,
  escapeHtml,
  resolveStoryMedia,
  STORY_PHOTO_LINK_PREVIEW,
  STORY_TEXT_LINK_PREVIEW,
  storyImageCount,
  storyPhotoUrl,
  storyPhotoUrls,
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

/** Enough of D1 for `getDayArchive`: column probes, the day batch, and the
 *  video read. Rows keep the order they are given. */
function dayArchiveDb(rows: Array<Record<string, unknown>>) {
  const items = rows.map((row, index) => ({
    url: `https://example.com/${String(row.id ?? index)}`,
    summary: null,
    summary_vi: null,
    published_at: 1_700_000_000 - index,
    points: 0,
    comments: 0,
    rank_score: rows.length - index,
    source_id: "hn",
    tags: "[]",
    ...row,
  }));
  const resultFor = (sql: string) => {
    if (sql.includes("FROM items i")) return { results: items };
    if (
      sql.includes("MAX(published_at)") ||
      sql.includes("MIN(published_at)")
    ) {
      return { results: [{ at: null }] };
    }
    return { results: [] };
  };
  const prepare = (sql: string) => {
    const stmt = {
      sql,
      bind() {
        return stmt;
      },
      async all() {
        return resultFor(sql);
      },
      async first() {
        return null;
      },
    };
    return stmt;
  };
  return {
    prepare,
    async batch(stmts: Array<{ sql: string }>) {
      return stmts.map((stmt) => resultFor(stmt.sql));
    },
  };
}

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
  it("stops at the hard daily cap", () => {
    expect(trendingBudget(TRENDING_BURST_MAX_PER_DAY, null, now)).toBe(0);
  });
  it("enforces the minimum gap since the last post", () => {
    expect(
      trendingBudget(0, now - (TRENDING_BURST_MIN_GAP_SEC - 60) * 1000, now)
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
    const { sql, binds } = buildTrendingQuery(
      "telegram",
      1_700_000_000_000,
      "vi"
    );
    expect(sql).toContain("status = 'published'");
    expect(sql).toContain("n.item_id IS NULL");
    // An ambiguous send may already be posted, so it is excluded like `sent`.
    expect(sql).toContain("n.status IN ('sent', 'ambiguous')");
    expect(sql).toContain("tr.lang = 'vi'");
    expect(sql).toContain("tr.title AS tr_title");
    expect(sql).toContain("i.media_manifest");
    expect(binds).toEqual([
      "telegram",
      1_700_000_000 - 24 * 3600,
      TRENDING_RANK_FLOOR,
      TRENDING_MIN_IMPORTANCE,
    ]);
  });

  it("reads the English translation for the English channel, never the Vietnamese one", () => {
    const { sql } = buildTrendingQuery("telegram-en", 1_700_000_000_000, "en");
    expect(sql).toContain("tr.lang = 'en'");
    expect(sql).not.toContain("tr.lang = 'vi'");
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
    expect(msg).toContain("No-link bullet");
    // Each bullet leads with a topic icon, not a dot.
    expect(msg).not.toContain("•");
  });

  it("uses English header and button copy when the digest falls back to EN", () => {
    const english: DailyDigest = {
      lang: "en",
      date: "2026-08-17",
      bullets: [{ text: "English bullet", url: "https://aidr.today/abcdef12" }],
    };
    expect(buildDigestMessage(english)).toContain("AI news today");
    expect(buildDigestMessage(english)).toContain("lang=en");
    const markup = buildDigestReplyMarkup(english) as {
      inline_keyboard: { text: string; url: string }[][];
    };
    expect(markup.inline_keyboard[0][0].text).toContain("full digest");
    // The button opens that day's page, not the live homepage.
    expect(markup.inline_keyboard[0][0].url).toBe(
      "https://aidr.today/date/2026-08-17?lang=en&utm_source=telegram"
    );
  });

  it("keeps the header plain text; the button opens the day page", () => {
    expect(buildDigestMessage(digest).split("\n")[0]).toBe(
      "<b>🗞 AI hôm nay có gì — 2026-08-17</b>"
    );
  });

  it("caps the photo caption on visible text, not raw HTML", () => {
    const long: DailyDigest = {
      lang: "vi",
      date: "2026-08-17",
      bullets: Array.from({ length: 20 }, (_, i) => ({
        text: `bullet ${i} ${"x".repeat(100)}`,
        url: "https://aidr.today/abcdef12",
      })),
    };
    const caption = buildDigestCaption(long);
    const visible = caption.replace(/<[^>]+>/g, "");
    expect(visible.length).toBeLessThanOrEqual(1024);
    expect(caption.split("📰").length - 1).toBeGreaterThan(4);
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

  it("reserves the album read link inside the 1024 caption cap", () => {
    for (const lang of ["vi", "en"] as const) {
      const caption = buildAlbumCaption(
        story({
          lang,
          title: "T".repeat(5_000),
          summary: "s".repeat(5_000),
        })
      );
      // Tags and the href are not visible. Telegram counts what remains.
      const visible = caption.replace(/<[^>]+>/g, "");
      expect(visible.length).toBeLessThanOrEqual(
        TELEGRAM_IV_LIMITS.captionChars
      );
      const label = lang === "en" ? "Read →" : "Đọc bài →";
      expect(caption).toContain(`>${label}</a>`);
      expect(caption).toContain("utm_source=telegram");
      expect(caption).toContain(`lang=${lang}`);
      expect(visible).not.toContain("utm_source=telegram");
      expect(visible).not.toContain("https://");
    }
  });

  it("names only the images that do not fit in a Telegram album", () => {
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
    // The three story images fill the album, so the caption stays quiet and
    // the generated card is not sent alongside them.
    expect(buildStoryCaption(multi)).not.toContain("ảnh nữa");
    expect(storyPhotoUrls(multi)).toHaveLength(3);
    expect(storyPhotoUrls(multi)).not.toContain(
      "https://aidr.today/api/og/abcdef12.png?lang=vi"
    );

    const overflow = story({
      media_manifest: {
        version: 1,
        assets: Array.from({ length: 12 }, (_, i) => ({
          type: "image" as const,
          url: `https://img.example/${i}.jpg`,
        })),
      },
    });
    // 12 story images, 10 album slots, so two are left out.
    expect(buildStoryCaption(overflow)).toContain("+2 ảnh nữa");
    expect(buildStoryCaption({ ...overflow, lang: "en" })).toContain("+2 more");
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

  it("leads with the story's own image and keeps the card as a fallback", () => {
    // The post leads with the real photo; the generated card is the fallback
    // for no usable image, or when Telegram rejects this one.
    const withManifest = story({
      image_url: null,
      media_manifest: {
        version: 1,
        assets: [{ type: "image", url: "https://img.example/poster.jpg" }],
      },
    });
    expect(storyPhotoUrl(withManifest)).toBe("https://img.example/poster.jpg");
    expect(resolveStoryMedia(withManifest)).toEqual({
      gallery: ["https://img.example/poster.jpg"],
      card: "https://aidr.today/api/og/abcdef12.png?lang=vi",
    });
    expect(resolveStoryMedia(story({ lang: "en" })).card).toBe(
      "https://aidr.today/api/og/abcdef12.png?lang=en"
    );
  });

  it("falls back to the generated card when the story has no usable image", () => {
    const imageless = story({ image_url: null, media_manifest: null });
    expect(storyImageCount(imageless)).toBe(0);
    expect(storyPhotoUrls(imageless)).toEqual([
      "https://aidr.today/api/og/abcdef12.png?lang=vi",
    ]);
    // Neither an image nor an addressable card means text-only, not a crash.
    const unaddressable = story({
      id: "zzz-not-a-story-id",
      image_url: null,
      media_manifest: null,
    });
    expect(resolveStoryMedia(unaddressable).card).toBeNull();
    expect(storyPhotoUrls(unaddressable)).toEqual([]);
  });

  it("builds a single Read button pointing at the aidr story page", () => {
    // The post's image is already the first-party generated card, so the link
    // must resolve to the same story on aidr.today rather than the publisher.
    // Two buttons used to split those apart.
    const markup = buildStoryReplyMarkup(story()) as {
      inline_keyboard: { text: string; url: string }[][];
    };
    const [row] = markup.inline_keyboard;
    expect(row).toHaveLength(1);
    expect(row[0].text).toBe("Đọc bài →");
    expect(row[0].url).toBe(
      "https://aidr.today/abcdef12?lang=vi&utm_source=telegram"
    );
  });

  it("never sends the reader off to the publisher URL", () => {
    const markup = buildStoryReplyMarkup(story()) as {
      inline_keyboard: { text: string; url: string }[][];
    };
    for (const button of markup.inline_keyboard.flat()) {
      expect(button.url).toContain("https://aidr.today/");
      expect(button.url).not.toContain("example.com");
    }
  });

  it("uses English story controls and links when translation is absent", () => {
    const markup = buildStoryReplyMarkup(story({ lang: "en" })) as {
      inline_keyboard: { text: string; url: string }[][];
    };
    expect(markup.inline_keyboard[0][0].text).toBe("Read →");
    expect(markup.inline_keyboard[0][0].url).toContain("lang=en");
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

describe("webhook severity", () => {
  // Every webhook story already cleared the relative trending bar; severity
  // must not hang off an absolute rank that a formula change can make
  // unreachable (a fixed rank >= 30 went dead with Phase B's rescale).
  it("marks exceptional importance, not a high absolute rank", () => {
    expect(
      storyEvent(
        story({ rank_score: 1, llm_importance: TRENDING_BURST_MIN_IMPORTANCE })
      ).severity
    ).toBe("warning");
    expect(
      storyEvent(
        story({
          rank_score: 1000,
          llm_importance: TRENDING_BURST_MIN_IMPORTANCE - 1,
        })
      ).severity
    ).toBe("info");
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
    expect(body.caption).toContain("AI news today");
    expect(body.caption).not.toContain("AI hôm nay");
    expect(body.caption).not.toContain("-100");
    expect(body.photo).toBe(
      "https://aidr.today/api/og/date/2026-08-17.png?lang=en"
    );
  });

  it("lists the day card, not the rolling TL;DR, and busts the photo URL", async () => {
    // The snapshot still leads with yesterday's long prose. The card is
    // today's ranked stories. The caption has to be the card.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 4 } }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const db = dayArchiveDb([
      {
        id: "4474df4c11111111",
        title: "Pop!_OS bans AI-generated code",
        title_vi: "Pop!_OS cấm mã AI trong phần lớn phần mềm",
        category: "opensource",
        image_url: "https://img.example/pop.jpg",
      },
      {
        id: "99a754ae11111111",
        title: "First woman to lead a trillion-dollar company",
        title_vi: "Nữ tướng công nghệ dẫn dắt công ty nghìn tỷ",
        category: "industry",
        image_url: "https://img.example/lead.jpg",
      },
    ]);
    await telegramNotifier.sendDigest(
      {
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_CHAT_ID: "chat",
        DB: db,
      } as unknown as Env,
      {
        lang: "vi",
        date: "2026-10-04",
        bullets: [
          {
            text: "Aleph Alpha ra mắt Kolibri, mô hình open-weight 78B với cửa sổ ngữ cảnh lên tới 1 triệu token",
            url: null,
          },
        ],
      }
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.caption).toContain("Pop!_OS cấm mã AI");
    expect(body.caption).toContain("Nữ tướng công nghệ");
    expect(body.caption).not.toContain("cửa sổ ngữ cảnh");
    expect(body.photo).toContain(
      "https://aidr.today/api/og/date/2026-10-04.png?"
    );
    expect(body.photo).toContain("lang=vi");
    expect(body.photo).toMatch(/[?&]v=[a-z0-9]+/);
    expect(body.photo).not.toContain("part=2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the next highlights as a second card when the lead grid is full", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 41 } }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `aa${i.toString(16).padStart(6, "0")}11111111`,
      title: `English story ${i}`,
      title_vi: `tin nổi bật số ${i} ${"Rất dài ".repeat(40)}`,
      category: "research",
      image_url: `https://img.example/${i}.jpg`,
    }));
    await telegramNotifier.sendDigest(
      {
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_CHAT_ID: "chat",
        DB: dayArchiveDb(rows),
      } as unknown as Env,
      {
        lang: "vi",
        date: "2026-10-04",
        bullets: [{ text: "yesterday prose that must not lead", url: null }],
      }
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const lead = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    const more = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/sendPhoto");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/sendPhoto");
    expect(lead.caption).toContain("tin nổi bật số 0");
    expect(lead.caption).toContain("tin nổi bật số 5");
    expect(lead.caption).not.toContain("tin nổi bật số 6");
    expect(lead.caption.replace(/<[^>]+>/g, "").length).toBeLessThanOrEqual(
      1000
    );
    expect(lead.reply_markup).toBeDefined();
    expect(lead.photo).not.toContain("part=2");
    expect(more.caption).toContain("Thêm tin nổi bật");
    expect(more.caption).toContain("tin nổi bật số 6");
    expect(more.caption).not.toContain("tin nổi bật số 0");
    expect(more.photo).toContain("part=2");
    expect(more.reply_markup).toBeUndefined();
    expect(more.reply_parameters.message_id).toBe(41);
  });

  it("sends a thin tail as text, not a second card", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 41 } }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: `bb${i.toString(16).padStart(6, "0")}11111111`,
      title: `English story ${i}`,
      title_vi: `tin nổi bật số ${i}`,
      category: "research",
      image_url: `https://img.example/${i}.jpg`,
    }));
    await telegramNotifier.sendDigest(
      {
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_CHAT_ID: "chat",
        DB: dayArchiveDb(rows),
      } as unknown as Env,
      {
        lang: "vi",
        date: "2026-10-04",
        bullets: [{ text: "edition bullet", url: null }],
      }
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/sendPhoto");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/sendMessage");
    const lead = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    const more = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(lead.caption).toContain("tin nổi bật số 5");
    expect(lead.caption).not.toContain("tin nổi bật số 6");
    expect(more.text).toContain("Thêm tin nổi bật");
    expect(more.text).toContain("tin nổi bật số 6");
    expect(more.text).toContain("tin nổi bật số 7");
    expect(more.text).not.toContain("tin nổi bật số 0");
    expect(more.photo).toBeUndefined();
    expect(more.reply_markup).toBeUndefined();
    expect(more.reply_parameters.message_id).toBe(41);
  });

  it("names the manifest photo, so the caption lead matches the card", async () => {
    // The column is a headline card or an overlong URL. The card paints the
    // manifest primary. A raw image_url read would drop the headline-card
    // story out of the six-photo lead.
    const overlong = `https://cdn.example/${"a".repeat(600)}.jpg`;
    const rows = [
      {
        id: "aa00000111111111",
        title: "Headline column is not the photo",
        title_vi: "Ảnh thật từ manifest dẫn đầu",
        image_url: "https://huggingnews.com/og/story.png",
        media_manifest: JSON.stringify({
          version: 1,
          assets: [{ type: "image", url: "https://cdn.example/real-a.jpg" }],
        }),
      },
      {
        id: "aa00000211111111",
        title: "Overlong column is not the photo",
        title_vi: "Ảnh thật thứ hai từ manifest",
        image_url: overlong,
        media_manifest: JSON.stringify({
          version: 1,
          assets: [{ type: "image", url: "https://cdn.example/real-b.jpg" }],
        }),
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `aa00000${i + 3}11111111`,
        title: `Plain photo ${i + 3}`,
        title_vi: `Ảnh thường số ${i + 3}`,
        image_url: `https://cdn.example/plain-${i + 3}.jpg`,
      })),
    ];
    const db = dayArchiveDb(rows);
    const archive = await getDayArchive(
      readSession(db as unknown as D1Database),
      "2026-10-04"
    );
    const card = splitDayHighlights(
      (archive.day?.items ?? [])
        .filter((item) => hasDayOgCopy(item, "vi"))
        .slice(0, DAY_CARD_CANDIDATES)
    );
    const pages = await loadDayCardPages(
      { DB: db } as unknown as Env,
      "2026-10-04",
      "vi"
    );
    const leadIds = [
      "aa00000111111111",
      "aa00000211111111",
      "aa00000311111111",
      "aa00000411111111",
      "aa00000511111111",
      "aa00000611111111",
    ];
    expect(card.lead.map((item) => item.id)).toEqual(leadIds);
    expect(archive.day?.items[0]?.image_url).toBe(
      "https://cdn.example/real-a.jpg"
    );
    expect(archive.day?.items[1]?.image_url).toBe(
      "https://cdn.example/real-b.jpg"
    );
    expect(pages?.[0]?.version).toBe(dayCardVersion(leadIds));
    const leadText = pages?.[0]?.bullets
      .map((bullet) => bullet.text)
      .join("\n");
    expect(leadText).toContain("Ảnh thật từ manifest dẫn đầu");
    expect(leadText).toContain("Ảnh thật thứ hai từ manifest");
    expect(leadText).not.toContain("Ảnh thường số 8");
  });

  it("sends the follow-up caption as text when Telegram rejects the second photo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 41 } }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: false, description: "wrong type of content" }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `cc${i.toString(16).padStart(6, "0")}11111111`,
      title: `English story ${i}`,
      title_vi: `tin nổi bật số ${i}`,
      image_url: `https://img.example/${i}.jpg`,
    }));
    const result = await telegramNotifier.sendDigest(
      {
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_CHAT_ID: "chat",
        DB: dayArchiveDb(rows),
      } as unknown as Env,
      {
        lang: "vi",
        date: "2026-10-04",
        bullets: [{ text: "edition bullet", url: null }],
      }
    );
    expect(result).toEqual({ ok: true, messageId: "41" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/sendPhoto");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/sendMessage");
    const photo = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    const text = JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string);
    expect(text.text).toBe(photo.caption);
    expect(text.reply_markup).toBeUndefined();
    expect(text.reply_parameters.message_id).toBe(41);
  });

  it("does not retry the lead when the follow-up photo outcome is unknown", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 41 } }), {
          status: 200,
        })
      )
      .mockRejectedValueOnce(
        new DOMException("The operation timed out.", "TimeoutError")
      );
    vi.stubGlobal("fetch", fetchMock);
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `dd${i.toString(16).padStart(6, "0")}11111111`,
      title: `English story ${i}`,
      title_vi: `tin nổi bật số ${i}`,
      image_url: `https://img.example/${i}.jpg`,
    }));
    const result = await telegramNotifier.sendDigest(
      {
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_CHAT_ID: "chat",
        DB: dayArchiveDb(rows),
      } as unknown as Env,
      {
        lang: "vi",
        date: "2026-10-04",
        bullets: [{ text: "edition bullet", url: null }],
      }
    );
    expect(result).toMatchObject({
      ok: false,
      ambiguous: true,
      messageId: "41",
    });
    expect(result.budgetExhausted).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/sendPhoto");
  });

  it("does not retry the lead when the follow-up is refused for budget", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 41 } }), {
          status: 200,
        })
      )
      .mockRejectedValueOnce(new Error("Too many subrequests by this script"));
    vi.stubGlobal("fetch", fetchMock);
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: `ee${i.toString(16).padStart(6, "0")}11111111`,
      title: `English story ${i}`,
      title_vi: `tin nổi bật số ${i}`,
      image_url: `https://img.example/${i}.jpg`,
    }));
    const result = await telegramNotifier.sendDigest(
      {
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_CHAT_ID: "chat",
        DB: dayArchiveDb(rows),
      } as unknown as Env,
      {
        lang: "vi",
        date: "2026-10-04",
        bullets: [{ text: "edition bullet", url: null }],
      }
    );
    expect(result).toMatchObject({
      ok: false,
      ambiguous: true,
      messageId: "41",
    });
    expect(result.budgetExhausted).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/sendMessage");
  });

  it("does not mark the digest sent when Telegram rejects the follow-up page", async () => {
    // A definite Bot API rejection of the tail used to log and still return
    // ok, so the day was stored as sent and the missing page was never
    // retried. The lead is already in the channel, so it must not be posted
    // again either.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 41 } }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: false, description: "wrong type of content" }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: `ff${i.toString(16).padStart(6, "0")}11111111`,
      title: `English story ${i}`,
      title_vi: `tin nổi bật số ${i}`,
      image_url: `https://img.example/${i}.jpg`,
    }));
    const result = await telegramNotifier.sendDigest(
      {
        TELEGRAM_BOT_TOKEN: "token",
        TELEGRAM_CHAT_ID: "chat",
        DB: dayArchiveDb(rows),
      } as unknown as Env,
      {
        lang: "vi",
        date: "2026-10-04",
        bullets: [{ text: "edition bullet", url: null }],
      }
    );
    expect(result).toMatchObject({
      ok: false,
      ambiguous: true,
      messageId: "41",
    });
    expect(result.budgetExhausted).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/sendPhoto");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/sendMessage");
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

  it("sends a Telegram album when the story has more than one image", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ ok: true, result: [{ message_id: 21 }] }),
            { status: 200 }
          )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await telegramNotifier.sendStory(
      { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat" } as Env,
      story({
        image_url: "https://img.example/a.jpg",
        media_manifest: {
          version: 1,
          assets: [
            { type: "image", url: "https://img.example/a.jpg" },
            { type: "image", url: "https://img.example/b.jpg" },
            {
              type: "video",
              url: "https://cdn.example/clip.mp4",
              poster_url: "https://img.example/poster.jpg",
            },
          ],
        },
      })
    );
    expect(result).toEqual({ ok: true, messageId: "21" });
    // Call 0 is the bounded video preflight; the mock is not a real MP4 so the
    // video is skipped and the poster photo album is sent as before.
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://cdn.example/clip.mp4");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("/sendMessage")
      )
    ).toBe(false);
    fetchMock.mock.calls.shift();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/sendMediaGroup");
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.media.map((item: { media: string }) => item.media)).toEqual([
      "https://img.example/a.jpg",
      "https://img.example/b.jpg",
      "https://img.example/poster.jpg",
    ]);
    // Albums cannot carry buttons. The same URL the button would use is one
    // HTML link in the caption, and nothing follows the album.
    const href = escapeHtml(
      withUtm(storyUrl({ id: "abcdef1234567890" }, "vi"), "vi")
    );
    expect(body.media[0].caption).toContain(`<a href="${href}">Đọc bài →</a>`);
    expect(body.media[0].caption).toContain("utm_source=telegram");
    expect(body.media[0].caption).toContain("lang=vi");
    expect(body.media[0].parse_mode).toBe("HTML");
    expect(body.reply_markup).toBeUndefined();
    expect(
      body.media.some((item: { media: string }) => item.media.endsWith(".mp4"))
    ).toBe(false);
  });

  it("falls back to one photo when the album is rejected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, description: "bad album" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 22 } }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await telegramNotifier.sendStory(
      { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat" } as Env,
      story({
        media_manifest: {
          version: 1,
          assets: [
            { type: "image", url: "https://img.example/a.jpg" },
            { type: "image", url: "https://img.example/b.jpg" },
          ],
        },
      })
    );
    expect(result.messageId).toBe("22");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/sendMediaGroup");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/sendPhoto");
    const photo = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    // The album failed, so the single-photo retry uses the lead story image.
    expect(photo.photo).toBe("https://img.example/a.jpg");
    expect(photo.reply_markup).toBeDefined();
  });

  it("retries with the generated card when Telegram rejects the image", async () => {
    // Hotlink-hostile / dead upstream URLs are the common failure. The card is
    // a first-party 200 that cannot be blocked, so the post keeps its image
    // instead of dropping to bare text.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: false, description: "wrong file identifier" }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 31 } }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await telegramNotifier.sendStory(
      { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat" } as Env,
      story({ image_url: "https://img.example/hotlink-hostile.png" })
    );
    expect(result).toEqual({ ok: true, messageId: "31" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(first.photo).toBe("https://img.example/hotlink-hostile.png");
    const retry = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(retry.photo).toBe("https://aidr.today/api/og/abcdef12.png?lang=vi");
  });

  it("posts once with the card when the story image is over Telegram's photo cap", async () => {
    // Gallery photos are not preflighted: Telegram fetches the URL and refuses
    // a photo over its 5 MB URL limit. That refusal is a definite answer, so
    // the card retry is safe, and the Worker itself never downloads the file.
    const big = "https://img.example/huge-12mb.jpg";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error_code: 400,
            description: "Bad Request: failed to get HTTP URL content",
          }),
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 41 } }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await telegramNotifier.sendStory(
      { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat" } as Env,
      story({ image_url: big })
    );
    expect(result).toEqual({ ok: true, messageId: "41" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every((call) =>
        String(call[0]).startsWith("https://api.telegram.org/")
      )
    ).toBe(true);
    const retry = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(retry.photo).toBe("https://aidr.today/api/og/abcdef12.png?lang=vi");
  });

  describe("unknown send outcome", () => {
    // Telegram fetches the photo itself, so the call can time out after the
    // post is already in the channel. Any further send, by any transport,
    // could show the same story twice.
    const tgEnv = {
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_CHAT_ID: "chat",
    } as Env;
    const timeout = () =>
      Promise.reject(
        new DOMException("The operation timed out.", "TimeoutError")
      );
    const ok = () =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), {
          status: 200,
        })
      );
    const twoImages = {
      version: 1 as const,
      assets: [
        { type: "image" as const, url: "https://img.example/a.jpg" },
        { type: "image" as const, url: "https://img.example/b.jpg" },
      ],
    };

    it("does not fall back to the card or text when sendPhoto times out", async () => {
      const fetchMock = vi.fn().mockImplementationOnce(timeout);
      fetchMock.mockImplementation(ok);
      vi.stubGlobal("fetch", fetchMock);

      const result = await telegramNotifier.sendStory(
        tgEnv,
        story({ image_url: "https://img.example/slow.jpg" })
      );
      expect(result).toMatchObject({ ok: false, ambiguous: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toContain("/sendPhoto");
    });

    it("does not fall back to one photo when the album times out", async () => {
      const fetchMock = vi.fn().mockImplementationOnce(timeout);
      fetchMock.mockImplementation(ok);
      vi.stubGlobal("fetch", fetchMock);

      const result = await telegramNotifier.sendStory(
        tgEnv,
        story({ media_manifest: twoImages })
      );
      expect(result).toMatchObject({ ok: false, ambiguous: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toContain("/sendMediaGroup");
    });

    it("sends a photo album as one message and does not send a follow-up", async () => {
      // A second reply used to time out after the album was already in the
      // channel, and the next hourly run posted the album again.
      const fetchMock = vi.fn().mockImplementationOnce(ok);
      vi.stubGlobal("fetch", fetchMock);

      const result = await telegramNotifier.sendStory(
        tgEnv,
        story({ media_manifest: twoImages })
      );
      expect(result).toEqual({ ok: true, messageId: "7" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toContain("/sendMediaGroup");
      const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
      expect(body.reply_markup).toBeUndefined();
      expect(body.media[0].caption).toContain("<a href=");
      expect(body.media[0].caption).toContain("utm_source=telegram");
      expect(body.media[0].caption).toContain("lang=vi");
    });

    it("reports a timed-out digest as ambiguous instead of throwing", async () => {
      // A thrown error is recorded as a plain failure and retried next hour,
      // which would post the day's digest a second time.
      vi.stubGlobal("fetch", vi.fn().mockImplementation(timeout));

      const result = await telegramNotifier.sendDigest(tgEnv, {
        lang: "vi",
        date: "2026-08-17",
        bullets: [],
      });
      expect(result).toMatchObject({ ok: false, ambiguous: true });
    });

    it("still treats a JSON error from Telegram as a definite rejection", async () => {
      // Telegram answered, so nothing was posted and a retry is safe.
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockImplementation(
            async () =>
              new Response(
                JSON.stringify({ ok: false, description: "chat not found" }),
                { status: 400 }
              )
          )
      );
      const result = await telegramNotifier.sendDigest(tgEnv, {
        lang: "vi",
        date: "2026-08-17",
        bullets: [],
      });
      expect(result).toEqual({ ok: false, error: "chat not found" });
    });
  });

  it("uses the generated card as the only media for an imageless story", async () => {
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
      story({ image_url: null, media_manifest: null })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.photo).toBe("https://aidr.today/api/og/abcdef12.png?lang=vi");
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
    // The digest is the day card photo with the bullets as its caption.
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/sendPhoto");
    expect(digestBody.photo).toBe(
      "https://aidr.today/api/og/date/2026-08-17.png?lang=vi"
    );

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
    const fetchMock = vi.fn().mockImplementation(
      async () =>
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
    const body = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
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
  it("returns already_sent for an ambiguous row, whatever its attempts", () => {
    // The digest may be in the channel already; resending would double-post.
    expect(classifyDigestSkip({ status: "ambiguous", attempts: 1 }, 12)).toBe(
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

// Trending was spam on a usual day (6 posts, some at importance 7) yet a
// flat low cap would mute the morning after a launch event. The normal
// tier keeps a usual day to a few spaced posts; only burst-level stories
// may go past it.
describe("trendingImportanceFloor", () => {
  const now = 1_700_000_000_000;
  const ago = (sec: number) => now - sec * 1000;
  it("asks for the normal bar while the day is under the normal cap", () => {
    expect(trendingImportanceFloor(0, null, now)).toBe(TRENDING_MIN_IMPORTANCE);
    expect(
      trendingImportanceFloor(
        TRENDING_MAX_PER_DAY - 1,
        ago(TRENDING_MIN_GAP_SEC),
        now
      )
    ).toBe(TRENDING_MIN_IMPORTANCE);
  });
  it("lets only a burst-level story past the normal cap", () => {
    expect(trendingImportanceFloor(TRENDING_MAX_PER_DAY, null, now)).toBe(
      TRENDING_BURST_MIN_IMPORTANCE
    );
  });
  it("lets only a burst-level story inside the normal gap", () => {
    expect(
      trendingImportanceFloor(0, ago(TRENDING_BURST_MIN_GAP_SEC), now)
    ).toBe(TRENDING_BURST_MIN_IMPORTANCE);
  });
  it("posts nothing past the burst cap or inside the burst gap", () => {
    expect(
      trendingImportanceFloor(TRENDING_BURST_MAX_PER_DAY, null, now)
    ).toBeNull();
    expect(
      trendingImportanceFloor(0, ago(TRENDING_BURST_MIN_GAP_SEC - 1), now)
    ).toBeNull();
  });
  it("puts the floor into the candidate query", () => {
    const { binds } = buildTrendingQuery(
      "telegram",
      now,
      "vi",
      TRENDING_BURST_MIN_IMPORTANCE
    );
    expect(binds[3]).toBe(TRENDING_BURST_MIN_IMPORTANCE);
  });
});

describe("classifyTrendingSkip", () => {
  const BAR = 12;
  it("reports below_min_rank when the live max is under the bar", () => {
    expect(classifyTrendingSkip(BAR - 0.01, 1, 0, 14, BAR)).toBe(
      "below_min_rank"
    );
  });
  it("reports budget_zero before looking at rank", () => {
    expect(classifyTrendingSkip(BAR, 0, 0, 14, BAR)).toBe("budget_zero");
  });
  it("reports none_unposted when rank clears the bar but nothing is left", () => {
    expect(classifyTrendingSkip(BAR, 1, 0, 14, BAR)).toBe("none_unposted");
  });
  it("returns null when a candidate may be sent", () => {
    expect(classifyTrendingSkip(BAR, 1, 2, 14, BAR)).toBeNull();
  });
  // 2026-09-30: all 6 daily posts went out between 00:33 and 08:36 local,
  // so both channels were silent for the whole audience day.
  it("holds a sendable story outside the 09-23 local window", () => {
    for (const hour of [0, 3, 8, 23]) {
      expect(classifyTrendingSkip(BAR, 1, 2, hour, BAR)).toBe("outside_hours");
    }
    expect(classifyTrendingSkip(BAR, 1, 2, 9, BAR)).toBeNull();
    expect(classifyTrendingSkip(BAR, 1, 2, 22, BAR)).toBeNull();
  });
});

describe("buildRankWindowQuery", () => {
  it("reads published ranks over the 72h bar window", () => {
    const { sql, binds } = buildRankWindowQuery(1_700_000_000_000);
    expect(sql).toContain("rank_score, published_at");
    expect(sql).toContain("status = 'published'");
    expect(binds).toEqual([1_700_000_000 - 72 * 3600]);
  });
});

describe("trendingRankBar", () => {
  // ~400 ranks spread like a normal 72h window, well above the floor.
  const window = Array.from({ length: 400 }, (_, i) => 2 + i * 0.05);

  // A rescored formula (new importance rubric, new corroboration) must move
  // the bar with it instead of silencing or flooding the channel.
  it("scales with the window: doubling every rank doubles the bar", () => {
    const bar = trendingRankBar(window);
    expect(bar).toBeGreaterThan(TRENDING_RANK_FLOOR);
    expect(trendingRankBar(window.map((r) => r * 2))).toBeCloseTo(bar * 2, 6);
  });

  it("lets only the window's top tail through", () => {
    const bar = trendingRankBar(window);
    const above = window.filter((r) => r >= bar).length;
    expect(above).toBeGreaterThan(0);
    expect(above).toBeLessThanOrEqual(
      Math.ceil(window.length * (1 - TRENDING_RANK_PERCENTILE))
    );
  });

  // A dead window's percentile is tiny; its best weak story must not post.
  it("holds the floor on a dead window", () => {
    const dead = Array.from({ length: 400 }, () => 1.5);
    expect(trendingRankBar(dead)).toBe(TRENDING_RANK_FLOOR);
    expect(trendingRankBar([])).toBe(TRENDING_RANK_FLOOR);
    expect(classifyTrendingSkip(2, 1, 1, 14, trendingRankBar(dead))).toBe(
      "below_min_rank"
    );
  });
});

describe("trending thresholds", () => {
  // The burst lane only means something if it asks for more than the
  // normal lane does.
  it("keeps the normal importance bar below the big-news burst bar", () => {
    expect(TRENDING_RANK_FLOOR).toBeGreaterThan(0);
    expect(TRENDING_MIN_IMPORTANCE).toBeLessThan(TRENDING_BURST_MIN_IMPORTANCE);
  });
  it("a usual day gets at most 3 posts, a big-news day at most 6", () => {
    expect(TRENDING_MAX_PER_DAY).toBe(3);
    expect(TRENDING_BURST_MAX_PER_DAY).toBe(6);
    expect(TRENDING_BURST_MIN_IMPORTANCE).toBe(9);
  });
});

describe("digestMark", () => {
  // The icon should say what the story is about: the TL;DR model's pick,
  // then the category, then a neutral newspaper.
  it("prefers the model emoji, then the category, then 📰", () => {
    expect(digestMark({ text: "x", url: null, emoji: "💰" })).toBe("💰");
    expect(digestMark({ text: "x", url: null, category: "Chips" })).toBe("🔌");
    expect(digestMark({ text: "x", url: null, category: "Unknown" })).toBe(
      "📰"
    );
  });
});

describe("channelCopy", () => {
  const base = { id: "x" };
  // Each channel posts only its own language. A VnExpress story reaches the
  // English channel through its vi→en translation (posted in Vietnamese
  // there on 2026-10-03 before this rule).
  it("uses the channel-language translation when it exists", async () => {
    const { channelCopy } = await import("../notify/index.js");
    const row = {
      ...base,
      source_title: "Dấu ấn Mark Zuckerberg",
      source_summary: "Tóm tắt",
      tr_title: "Mark Zuckerberg's mark",
      tr_summary: "Summary",
    };
    expect(channelCopy(row, "en")).toEqual({
      ...base,
      title: "Mark Zuckerberg's mark",
      summary: "Summary",
      lang: "en",
    });
  });

  it("posts source copy only when the source is in the channel language", async () => {
    const { channelCopy } = await import("../notify/index.js");
    const vi = {
      ...base,
      source_title: "Dấu ấn Mark Zuckerberg",
      source_summary: "Tóm tắt",
      tr_title: null,
      tr_summary: null,
    };
    const en = { ...vi, source_title: "Gemini 4", source_summary: "S" };
    expect(channelCopy(vi, "vi")?.title).toBe("Dấu ấn Mark Zuckerberg");
    expect(channelCopy(vi, "en")).toBeNull();
    expect(channelCopy(en, "en")?.lang).toBe("en");
    // No English fallback on the Vietnamese channel.
    expect(channelCopy(en, "vi")).toBeNull();
  });
});
