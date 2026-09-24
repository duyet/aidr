import { describe, expect, it } from "vitest";
import {
  assertNotifyConfig,
  buildMaxRankQuery,
  buildTrendingQuery,
  classifyDigestSkip,
  classifyTrendingSkip,
  DIGEST_LOCAL_HOUR,
  digestKey,
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
  escapeHtml,
  storyUrl,
  telegramNotifier,
  withUtm,
} from "../notify/telegram.js";
import type { DailyDigest, StoryPayload } from "../notify/types.js";
import { digestEvent, storyEvent } from "../notify/webhook.js";
import type { Env } from "../types.js";

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
    expect(binds).toEqual([
      "telegram",
      1_700_000_000 - 24 * 3600,
      TRENDING_MIN_RANK,
      TRENDING_MIN_IMPORTANCE,
    ]);
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
