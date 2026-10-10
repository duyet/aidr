import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalizeMediaImageUrl } from "../media.js";
import { isValidEmail, isValidTimezone } from "../subscribe/handlers.js";
import {
  buildDigestEmail,
  DIGEST_LOCAL_HOUR,
  digestBulletsWithImages,
  digestBulletsWithItems,
  getLocalHourAndDate,
  primaryItemId,
  sendConfirmEmail,
  sendDailyTldr,
  sendSettingsChangeEmail,
  sendWelcomeEmail,
  shouldSendForSubscriber,
  snapshotHasBullets,
  topBullets,
} from "../subscribe/send.js";
import type { Env } from "../types.js";

describe("isValidEmail", () => {
  it("accepts well-formed addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("a.b+c@sub.example.co")).toBe(true);
  });

  it("rejects malformed addresses and non-strings", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@domain")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(123)).toBe(false);
  });

  it("rejects overlong addresses", () => {
    const long = `${"a".repeat(250)}@example.com`;
    expect(isValidEmail(long)).toBe(false);
  });
});

describe("topBullets", () => {
  it("caps at 5 bullets by default", () => {
    const bullets = Array.from({ length: 8 }, (_, i) => ({ text: `b${i}` }));
    expect(topBullets(JSON.stringify(bullets))).toHaveLength(5);
  });

  it("returns empty for null/invalid JSON/non-array", () => {
    expect(topBullets(null)).toEqual([]);
    expect(topBullets("not json")).toEqual([]);
    expect(topBullets(JSON.stringify({ a: 1 }))).toEqual([]);
  });

  it("promotes item_ids[0] onto item_id for telegram permalinks", () => {
    expect(
      topBullets(JSON.stringify([{ text: "hi", item_ids: ["abc", "def"] }]))
    ).toEqual([{ text: "hi", item_id: "abc", item_ids: ["abc", "def"] }]);
  });
});

describe("snapshotHasBullets", () => {
  it("returns false when both languages are empty", () => {
    expect(snapshotHasBullets({ bullets_en: null, bullets_vi: null })).toBe(
      false
    );
  });

  it("returns true when either language has bullets", () => {
    expect(
      snapshotHasBullets({
        bullets_en: JSON.stringify([{ text: "a" }]),
        bullets_vi: null,
      })
    ).toBe(true);
    expect(
      snapshotHasBullets({
        bullets_en: null,
        bullets_vi: JSON.stringify([{ text: "a" }]),
      })
    ).toBe(true);
  });
});

describe("isValidTimezone", () => {
  it("accepts real IANA timezone names", () => {
    expect(isValidTimezone("Asia/Ho_Chi_Minh")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
  });

  it("rejects garbage, non-IANA offsets, empty strings, and non-strings", () => {
    expect(isValidTimezone("not-a-timezone")).toBe(false);
    expect(isValidTimezone("UTC+7")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone(undefined)).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(123)).toBe(false);
  });
});

describe("getLocalHourAndDate", () => {
  // 2026-08-16T12:00:00Z (noon UTC), a fixed point for cross-timezone math
  const noonUtc = Date.UTC(2026, 7, 16, 12, 0, 0);

  it("computes the correct local hour and date for a timezone ahead of UTC", () => {
    // Asia/Ho_Chi_Minh is UTC+7 — noon UTC is 19:00 local, same calendar day
    const { hour, date } = getLocalHourAndDate(noonUtc, "Asia/Ho_Chi_Minh");
    expect(hour).toBe(19);
    expect(date).toBe("2026-08-16");
  });

  it("rolls over to the next local date for a timezone far enough ahead of UTC", () => {
    // Pacific/Auckland is UTC+12 — noon UTC is midnight the next local day
    const { hour, date } = getLocalHourAndDate(noonUtc, "Pacific/Auckland");
    expect(hour).toBe(0);
    expect(date).toBe("2026-08-17");
  });

  it("rolls back to the previous local date for a timezone behind UTC", () => {
    // America/Los_Angeles is UTC-7 (DST) in August — noon UTC is early morning, same day
    const { hour, date } = getLocalHourAndDate(noonUtc, "America/Los_Angeles");
    expect(hour).toBe(5);
    expect(date).toBe("2026-08-16");
  });

  it("falls back to the default timezone for an invalid one", () => {
    const withInvalid = getLocalHourAndDate(noonUtc, "not-a-timezone");
    const withDefault = getLocalHourAndDate(noonUtc, "Asia/Ho_Chi_Minh");
    expect(withInvalid).toEqual(withDefault);
  });

  it("falls back to the default timezone when none is given", () => {
    const withNull = getLocalHourAndDate(noonUtc, null);
    const withDefault = getLocalHourAndDate(noonUtc, "Asia/Ho_Chi_Minh");
    expect(withNull).toEqual(withDefault);
  });
});

describe("shouldSendForSubscriber — gate matrix", () => {
  it("does not send before the local digest hour", () => {
    expect(
      shouldSendForSubscriber(
        { last_sent_date: null },
        DIGEST_LOCAL_HOUR - 1,
        "2026-08-16"
      )
    ).toBe(false);
  });

  it("sends once at/after the local digest hour, on a fresh date", () => {
    expect(
      shouldSendForSubscriber(
        { last_sent_date: null },
        DIGEST_LOCAL_HOUR,
        "2026-08-16"
      )
    ).toBe(true);
    expect(
      shouldSendForSubscriber(
        { last_sent_date: "2026-08-15" },
        DIGEST_LOCAL_HOUR,
        "2026-08-16"
      )
    ).toBe(true);
  });

  it("does not send again the same local day once already sent", () => {
    expect(
      shouldSendForSubscriber(
        { last_sent_date: "2026-08-16" },
        DIGEST_LOCAL_HOUR + 5,
        "2026-08-16"
      )
    ).toBe(false);
  });

  it("sends again once the local date rolls over", () => {
    expect(
      shouldSendForSubscriber(
        { last_sent_date: "2026-08-16" },
        DIGEST_LOCAL_HOUR,
        "2026-08-17"
      )
    ).toBe(true);
  });
});

describe("buildDigestEmail", () => {
  const bullets = Array.from({ length: 7 }, (_, i) => ({ text: `story ${i}` }));

  it("caps the email body at 5 bullets", () => {
    const { text, html } = buildDigestEmail("2026-08-16", bullets, "en", "tok");
    expect(text).toContain("story 0");
    expect(text).toContain("story 4");
    expect(text).not.toContain("story 5");
    expect(html).not.toContain("story 5");
    expect(html).toContain(">Settings</a>");
    expect(html).toContain("subscribe?settings=tok");
  });

  it("renders a text-only layout without the designed hero", () => {
    const { html } = buildDigestEmail(
      "2026-08-16",
      [{ text: "Story", image_url: "https://cdn.example/a.jpg" }],
      "vi",
      "tok",
      5,
      "text"
    );
    expect(html).not.toContain("mail-hero");
    expect(html).toContain("Story");
    expect(html).toContain("white-space:pre-wrap");
  });

  it("builds exact English story links", () => {
    const { html } = buildDigestEmail(
      "2026-08-16",
      [{ text: "Story", item_id: "abcdef123456" }],
      "en",
      "tok"
    );
    expect(html).toContain(
      "https://aidr.today/abcdef12?lang=en&amp;utm_source=email&amp;utm_medium=digest&amp;utm_campaign=digest"
    );
  });

  it("selects the Vietnamese unsubscribe copy for lang=vi", () => {
    const { text } = buildDigestEmail("2026-08-16", bullets, "vi", "tok");
    expect(text).toContain("Hủy đăng ký");
  });

  it("builds exact Vietnamese story links", () => {
    const { html } = buildDigestEmail(
      "2026-08-16",
      [{ text: "Tin", item_id: "abcdef123456" }],
      "vi",
      "tok"
    );
    expect(html).toContain(
      "https://aidr.today/abcdef12?lang=vi&amp;utm_source=email&amp;utm_medium=digest&amp;utm_campaign=digest"
    );
  });

  it("selects the English unsubscribe copy for lang=en", () => {
    const { text } = buildDigestEmail("2026-08-16", bullets, "en", "tok");
    expect(text).toContain("Unsubscribe:");
  });

  it("includes the unsubscribe link with the given token", () => {
    const { html } = buildDigestEmail("2026-08-16", bullets, "en", "abc123");
    expect(html).toContain("https://aidr.today/subscribe?unsubscribe=abc123");
    expect(html).toContain("https://aidr.today/subscribe?settings=abc123");
  });

  it("escapes HTML-sensitive characters in bullet text", () => {
    const { html } = buildDigestEmail(
      "2026-08-16",
      [{ text: '<script>alert(1)</script> & "quoted"' }],
      "en",
      "tok"
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;quoted&quot;");
  });

  it("leads the subject with the top headline, cut whole at a word, and keeps story text out of the preheader", () => {
    const long =
      "OpenAI ships a coding model that rewrites entire repositories overnight and then keeps going past any reasonable subject length";
    const { subject, html } = buildDigestEmail(
      "2026-08-16",
      [
        { text: long, image_url: "javascript:alert(1)" },
        { text: "second story", image_url: "http://127.0.0.1/private.jpg" },
        {
          text: "third story",
          image_url: "https://cdn.example/hero-shot.jpg?utm_source=newsletter",
        },
      ],
      "en",
      "tok"
    );
    const photo = canonicalizeMediaImageUrl(
      "https://cdn.example/hero-shot.jpg?utm_source=newsletter"
    );
    expect(photo).toBeTruthy();
    expect(canonicalizeMediaImageUrl("javascript:alert(1)")).toBeNull();
    expect(
      canonicalizeMediaImageUrl("http://127.0.0.1/private.jpg")
    ).toBeNull();
    // The inbox shows ~60 characters: lead with the news, never a bare date.
    expect(subject.startsWith("OpenAI ships a coding model")).toBe(true);
    expect(subject.endsWith("… + 2 more")).toBe(true);
    expect(subject.length).toBeLessThanOrEqual(60);
    expect(html).toContain(`<title>${subject}</title>`);
    // The preheader is written on purpose, not story 1's text cut mid-sentence.
    expect(html).toContain("Sunday's 3 AI stories in 1 minute.");
    expect(html).not.toContain(`opacity:0;mso-hide:all">${long}`);
    // The lead's image is unsafe, so no lead image; story 3 keeps its photo.
    expect(html).not.toContain("mail-lead-image");
    expect(html).toContain(`src="${photo}"`);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("127.0.0.1");
  });

  it("leads with the top story's own photo, never the day card or an OG card", () => {
    const lead = buildDigestEmail(
      "2026-08-16",
      [
        {
          text: "Photo story",
          image_url: "https://cdn.example/photos/claude-stage.jpg",
        },
        { text: "Other story" },
      ],
      "en",
      "tok"
    ).html;
    expect(lead).toContain(
      'class="mail-lead-image" src="https://cdn.example/photos/claude-stage.jpg"'
    );
    const card = buildDigestEmail(
      "2026-08-16",
      [
        {
          text: "Card story",
          image_url: "https://marketbrief.now/og/anthropic-card.png",
        },
        {
          text: "Photo story",
          image_url: "https://cdn.example/photos/claude-stage.jpg",
        },
      ],
      "en",
      "tok"
    ).html;
    expect(card).not.toContain("mail-lead-image");
    expect(card).not.toContain("/api/og/date/");
    // The one CTA goes to the day page.
    expect(card).toContain('href="https://aidr.today/date/2026-08-16?lang=en');
    expect(card).toContain("See all stories on aidr.today");
    expect(card).not.toContain("Read more");
  });

  it("shows no image at all when no story image canonicalizes", () => {
    const { html } = buildDigestEmail(
      "2026-08-16",
      [{ text: "Plain story", image_url: "not a url" }],
      "en",
      "tok"
    );
    expect(html).not.toContain("mail-lead-image");
    expect(html).not.toContain("/api/og/date/");
    expect(html).not.toContain("not a url");
  });

  it("renders the day video for its language and omits it otherwise", () => {
    const video = { youtubeId: "R3j93-pO9ac", title: "Today in two minutes" };
    const withVideo = buildDigestEmail(
      "2026-08-16",
      bullets,
      "en",
      "tok",
      5,
      "design",
      { video }
    );
    expect(withVideo.html).toContain(
      "https://i.ytimg.com/vi/R3j93-pO9ac/hqdefault.jpg"
    );
    expect(withVideo.html).toContain("Today in two minutes");
    const without = buildDigestEmail("2026-08-16", bullets, "en", "tok");
    expect(without.html).not.toContain("i.ytimg.com");
  });
});

describe("digest subject in Vietnamese", () => {
  it("leads with the Vietnamese story and never the English label", () => {
    const { subject, text } = buildDigestEmail(
      "2026-08-16",
      [{ text: "tin ".repeat(60) }],
      "vi",
      "tok"
    );
    expect(subject.startsWith("tin tin")).toBe(true);
    expect(subject.length).toBeLessThanOrEqual(60);
    expect(subject).not.toContain("Today in AI");
    expect(
      text.startsWith("AI;DR — Chủ Nhật, 16 tháng 8, 2026\n1 tin · 1 phút đọc")
    ).toBe(true);
  });
});

describe("digestBulletsWithItems", () => {
  const rows = [
    {
      id: "b",
      title: "English title B",
      title_vi: null,
      category: "Agent",
      url: "https://www.techcrunch.com/x",
      image_url: "https://cdn.example/b.jpg",
    },
    {
      id: "a",
      title: "English title A",
      title_vi: "Tiêu đề A",
      category: "Funding",
      url: "https://bloomberg.com/y",
      image_url: null,
    },
  ];
  const bullets = [
    { text: "Bullet A. More.", item_ids: ["a"] },
    { text: "Bullet B. More.", item_ids: ["b"] },
  ];

  it("joins each bullet to its own item by id, not by position", () => {
    const en = digestBulletsWithItems(bullets, rows, "en");
    expect(en[0]).toMatchObject({
      headline: "English title A",
      category: "Funding",
      source: "bloomberg.com",
    });
    expect(en[1]).toMatchObject({
      headline: "English title B",
      source: "techcrunch.com",
      image_url: "https://cdn.example/b.jpg",
    });
  });

  it("uses title_vi for Vietnamese and never falls back to the English title", () => {
    const vi = digestBulletsWithItems(bullets, rows, "vi");
    expect(vi[0]?.headline).toBe("Tiêu đề A");
    expect(vi[1]?.headline).toBeUndefined();
    const { html } = buildDigestEmail("2026-08-16", vi, "vi", "tok");
    expect(html).not.toContain("English title B");
    expect(html).toContain(">Bullet B.</font>");
  });
});

describe("digestBulletsWithImages", () => {
  it("fills image_url from the cited item when the snapshot bullet has none", () => {
    const hydrated = digestBulletsWithImages(
      [
        { text: "Anthropic filing", item_ids: ["item-og"] },
        { text: "Claude on stage", item_ids: ["item-photo"] },
      ],
      [
        { id: "item-og", image_url: "https://news.example/og/card.png" },
        { id: "item-photo", image_url: "https://cdn.example/photos/room.jpg" },
      ]
    );
    expect(hydrated[0]?.image_url).toBe("https://news.example/og/card.png");
    expect(hydrated[1]?.image_url).toBe("https://cdn.example/photos/room.jpg");
    const { html } = buildDigestEmail("2026-09-29", hydrated, "en", "tok");
    expect(html).not.toContain(
      'class="mail-lead-image" src="https://news.example/og/'
    );
    expect(html).toContain('src="https://cdn.example/photos/room.jpg"');
  });
});

describe("sendDailyTldr — per-subscriber send flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeEnv(opts: {
    subscribers: Array<{
      email: string;
      lang: string;
      unsubscribe_token: string;
      timezone: string | null;
      last_sent_date: string | null;
    }>;
    emailShouldFail?: (email: string) => boolean;
    bulletsEn?: unknown[];
    items?: Array<{ id: string; image_url: string | null }>;
  }) {
    const updates: { sql: string; args: unknown[] }[] = [];
    const sentTo: string[] = [];
    const sentHtml: string[] = [];
    const db = {
      batch: async (statements: { run: () => Promise<unknown> }[]) => {
        for (const stmt of statements) await stmt.run();
        return [];
      },
      prepare(sql: string) {
        const bound = () => ({
          first: async () => ({
            date: "2026-08-16",
            bullets_en: JSON.stringify(opts.bulletsEn ?? [{ text: "story" }]),
            bullets_vi: JSON.stringify([{ text: "tin tức" }]),
            sent_at: null,
          }),
          all: async () => ({
            results: sql.includes("FROM items")
              ? (opts.items ?? [])
              : opts.subscribers,
          }),
          run: async () => ({ success: true }),
        });
        return {
          ...bound(),
          bind: (...args: unknown[]) => {
            if (sql.startsWith("UPDATE")) updates.push({ sql, args });
            return bound();
          },
        };
      },
    };
    const email = {
      send: async (msg: { to: string; html?: string }) => {
        if (opts.emailShouldFail?.(msg.to)) {
          throw new Error("send failed");
        }
        sentTo.push(msg.to);
        if (msg.html) sentHtml.push(msg.html);
      },
    };
    return {
      env: { DB: db, EMAIL: email } as unknown as Env,
      updates,
      sentTo,
      sentHtml,
    };
  }

  it("skips a subscriber whose local time hasn't reached the digest hour", async () => {
    // Fixed UTC instant where Asia/Ho_Chi_Minh (UTC+7) local hour is 2am.
    const fixedNow = Date.UTC(2026, 7, 16, 19, 0, 0); // 19:00 UTC -> 02:00 ICT next day
    const { env, sentTo } = makeEnv({
      subscribers: [
        {
          email: "early@example.com",
          lang: "en",
          unsubscribe_token: "t1",
          timezone: "Asia/Ho_Chi_Minh",
          last_sent_date: null,
        },
      ],
    });
    vi.setSystemTime(fixedNow);
    await sendDailyTldr(env);
    expect(sentTo).toEqual([]);
  });

  it("sends once past the digest hour and stamps last_sent_date", async () => {
    // 03:00 UTC -> 10:00 ICT (Asia/Ho_Chi_Minh, UTC+7) — past the gate.
    const fixedNow = Date.UTC(2026, 7, 16, 3, 0, 0);
    const { env, updates, sentTo } = makeEnv({
      subscribers: [
        {
          email: "ok@example.com",
          lang: "en",
          unsubscribe_token: "t1",
          timezone: "Asia/Ho_Chi_Minh",
          last_sent_date: null,
        },
      ],
    });
    vi.setSystemTime(fixedNow);
    await sendDailyTldr(env);

    expect(sentTo).toEqual(["ok@example.com"]);
    const stamp = updates.find(
      (u) =>
        u.sql.includes("UPDATE subscribers") &&
        u.args.includes("ok@example.com")
    );
    expect(stamp?.args).toContain("2026-08-16");
  });

  it("hydrates a hero from the item image when the snapshot bullet has no image_url", async () => {
    const fixedNow = Date.UTC(2026, 7, 16, 3, 0, 0);
    const { env, sentHtml } = makeEnv({
      bulletsEn: [
        { text: "Filing", item_ids: ["item-og"] },
        { text: "On stage", item_ids: ["item-photo"] },
      ],
      items: [
        { id: "item-og", image_url: "https://news.example/og/card.png" },
        { id: "item-photo", image_url: "https://cdn.example/photos/room.jpg" },
      ],
      subscribers: [
        {
          email: "ok@example.com",
          lang: "en",
          unsubscribe_token: "t1",
          timezone: "Asia/Ho_Chi_Minh",
          last_sent_date: null,
        },
      ],
    });
    vi.setSystemTime(fixedNow);
    await sendDailyTldr(env);
    expect(sentHtml[0]).toContain('src="https://cdn.example/photos/room.jpg"');
    expect(sentHtml[0]).not.toContain(
      'class="mail-hero" src="https://news.example/og/'
    );
  });

  it("does not stamp last_sent_date when the send fails, so it retries next hour", async () => {
    const fixedNow = Date.UTC(2026, 7, 16, 3, 0, 0);
    const { env, updates, sentTo } = makeEnv({
      subscribers: [
        {
          email: "fail@example.com",
          lang: "en",
          unsubscribe_token: "t1",
          timezone: "Asia/Ho_Chi_Minh",
          last_sent_date: null,
        },
      ],
      emailShouldFail: () => true,
    });
    vi.setSystemTime(fixedNow);
    await sendDailyTldr(env);

    expect(sentTo).toEqual([]);
    const stamp = updates.find(
      (u) =>
        u.sql.includes("UPDATE subscribers") &&
        u.args.includes("fail@example.com")
    );
    expect(stamp).toBeUndefined();
  });

  it("does not send twice in the same local day (second run same day no-send)", async () => {
    const fixedNow = Date.UTC(2026, 7, 16, 3, 0, 0); // 10:00 ICT
    const { env, sentTo } = makeEnv({
      subscribers: [
        {
          email: "already@example.com",
          lang: "en",
          unsubscribe_token: "t1",
          timezone: "Asia/Ho_Chi_Minh",
          last_sent_date: "2026-08-16", // already sent today, local date
        },
      ],
    });
    vi.setSystemTime(fixedNow);
    await sendDailyTldr(env);
    expect(sentTo).toEqual([]);
  });

  it("sends again once the subscriber's local date rolls over", async () => {
    const fixedNow = Date.UTC(2026, 7, 17, 3, 0, 0); // next local day, 10:00 ICT
    const { env, sentTo } = makeEnv({
      subscribers: [
        {
          email: "nextday@example.com",
          lang: "en",
          unsubscribe_token: "t1",
          timezone: "Asia/Ho_Chi_Minh",
          last_sent_date: "2026-08-16",
        },
      ],
    });
    vi.setSystemTime(fixedNow);
    await sendDailyTldr(env);
    expect(sentTo).toEqual(["nextday@example.com"]);
  });

  it("waits for the subscriber's local-date edition instead of mailing the UTC-dated one, then sends it once (#532)", async () => {
    // 2026-08-16T20:00Z is 08:00 on 2026-08-17 in Auckland (UTC+12): past
    // the digest hour, but only the UTC-dated 2026-08-16 snapshot exists.
    const snapshots = new Map<string, unknown>([
      [
        "2026-08-16",
        {
          date: "2026-08-16",
          bullets_en: JSON.stringify([{ text: "yesterday" }]),
          bullets_vi: JSON.stringify([]),
          sent_at: null,
        },
      ],
    ]);
    const subscriber = {
      email: "nz@example.com",
      lang: "en",
      unsubscribe_token: "t1",
      timezone: "Pacific/Auckland",
      last_sent_date: null as string | null,
    };
    const sentSubjects: string[] = [];
    const db = {
      batch: async () => [],
      prepare(sql: string) {
        const bound = (args: unknown[]) => ({
          first: async () =>
            sql.includes("FROM tldr_snapshots")
              ? (snapshots.get(args[0] as string) ?? null)
              : null,
          all: async () => ({
            results: sql.includes("FROM subscribers") ? [subscriber] : [],
          }),
          run: async () => {
            if (sql.startsWith("UPDATE subscribers SET last_sent_date")) {
              subscriber.last_sent_date = args[0] as string;
            }
            return { success: true };
          },
        });
        return { ...bound([]), bind: (...args: unknown[]) => bound(args) };
      },
    };
    const env = {
      DB: db,
      EMAIL: {
        send: async (msg: { subject: string }) => {
          sentSubjects.push(msg.subject);
        },
      },
    } as unknown as Env;

    vi.setSystemTime(Date.UTC(2026, 7, 16, 20, 0, 0));
    await sendDailyTldr(env);
    expect(sentSubjects).toEqual([]);
    expect(subscriber.last_sent_date).toBeNull();

    // The next 30-minute tick, after the local-date edition is written.
    snapshots.set("2026-08-17", {
      date: "2026-08-17",
      bullets_en: JSON.stringify([{ text: "today" }]),
      bullets_vi: JSON.stringify([]),
      sent_at: null,
    });
    vi.setSystemTime(Date.UTC(2026, 7, 16, 20, 30, 0));
    await sendDailyTldr(env);
    expect(sentSubjects).toHaveLength(1);
    expect(subscriber.last_sent_date).toBe("2026-08-17");

    vi.setSystemTime(Date.UTC(2026, 7, 16, 21, 0, 0));
    await sendDailyTldr(env);
    expect(sentSubjects).toHaveLength(1);
  });

  it("does not send Vietnamese from English bullets, and still sends the English subscriber", async () => {
    const fixedNow = Date.UTC(2026, 7, 16, 3, 0, 0);
    const updates: { sql: string; args: unknown[] }[] = [];
    const sent: string[] = [];
    const subscribers = [
      {
        email: "vi@example.com",
        lang: "vi",
        unsubscribe_token: "t1",
        timezone: "Asia/Ho_Chi_Minh",
        last_sent_date: null,
      },
      {
        email: "en@example.com",
        lang: "en",
        unsubscribe_token: "t2",
        timezone: "Asia/Ho_Chi_Minh",
        last_sent_date: null,
      },
    ];
    const db = {
      prepare(sql: string) {
        const bound = () => ({
          first: async () => ({
            date: "2026-08-16",
            bullets_en: JSON.stringify([{ text: "story" }]),
            bullets_vi: JSON.stringify([]),
            sent_at: null,
          }),
          all: async () => ({
            results: sql.includes("FROM items") ? [] : subscribers,
          }),
          run: async () => ({ success: true }),
        });
        return {
          ...bound(),
          bind: (...args: unknown[]) => {
            if (sql.startsWith("UPDATE")) updates.push({ sql, args });
            return bound();
          },
        };
      },
    };
    const env = {
      DB: db,
      EMAIL: {
        send: async (msg: { to: string }) => {
          sent.push(msg.to);
        },
      },
    } as unknown as Env;
    vi.setSystemTime(fixedNow);
    await sendDailyTldr(env);
    expect(sent).toEqual(["en@example.com"]);
    expect(
      updates.some(
        (u) =>
          u.sql.includes("UPDATE subscribers") &&
          u.args.includes("vi@example.com")
      )
    ).toBe(false);
    expect(
      updates.some(
        (u) =>
          u.sql.includes("UPDATE subscribers") &&
          u.args.includes("en@example.com")
      )
    ).toBe(true);
  });
});

describe("primaryItemId", () => {
  it("prefers legacy item_id, then the first item_ids entry", () => {
    expect(primaryItemId({ text: "a", item_id: "legacy" })).toBe("legacy");
    expect(primaryItemId({ text: "a", item_ids: ["new1", "new2"] })).toBe(
      "new1"
    );
    expect(primaryItemId({ text: "a" })).toBeUndefined();
  });
});

describe("note mails share the digest shell", () => {
  const sub = { email: "r@aidr.today", lang: "en", unsubscribe_token: "tok" };
  const prefs = {
    lang: "vi" as const,
    timezone: "Asia/Ho_Chi_Minh",
    digest_size: 10,
    mail_format: "large" as const,
  };

  it.each([
    [
      "confirm",
      (env: Env) => sendConfirmEmail(env, sub),
      "Confirm subscription",
    ],
    ["welcome", (env: Env) => sendWelcomeEmail(env, sub), "Open aidr.today"],
    [
      "settings change",
      (env: Env) => sendSettingsChangeEmail(env, sub, prefs),
      "set_lang=vi",
    ],
  ])(
    "%s mail has the wordmark header, the footer and the postal address",
    async (_name, send, needle) => {
      const sent: Array<{
        html: string;
        text: string;
        from: { name: string };
      }> = [];
      const env = {
        EMAIL: { send: async (m: (typeof sent)[number]) => void sent.push(m) },
        MAIL_POSTAL_ADDRESS: "PO Box 1",
      } as unknown as Env;
      expect(await send(env)).toBe(true);
      const { html, text, from } = sent[0]!;
      expect(from.name).toBe("AI;DR");
      expect(html).toContain(">AI;DR</span>");
      expect(html).toContain("AI news, ranked and summarized");
      expect(html).toContain("max-width:600px");
      expect(html).toContain("unsubscribe=tok");
      expect(html).toContain("AI;DR · PO Box 1");
      expect(html).toContain(needle);
      expect(text).toContain("AI;DR · PO Box 1");
    }
  );
});
