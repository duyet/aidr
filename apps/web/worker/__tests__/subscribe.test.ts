import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalizeMediaImageUrl } from "../media.js";
import { isValidEmail, isValidTimezone } from "../subscribe/handlers.js";
import {
  buildDigestEmail,
  DIGEST_LOCAL_HOUR,
  digestBulletsWithImages,
  getLocalHourAndDate,
  primaryItemId,
  sendDailyTldr,
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
    expect(html).toContain("Adjust settings");
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

  it("keeps the subject and heading short and whole, however long the first bullet is", () => {
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
    const hero = canonicalizeMediaImageUrl(
      "https://cdn.example/hero-shot.jpg?utm_source=newsletter"
    );
    expect(hero).toBeTruthy();
    expect(canonicalizeMediaImageUrl("javascript:alert(1)")).toBeNull();
    expect(
      canonicalizeMediaImageUrl("http://127.0.0.1/private.jpg")
    ).toBeNull();
    // A cut subject reads as broken in an inbox, so the title is fixed and
    // the story text goes to the preheader instead.
    expect(subject).toBe("AI;DR — 2026-08-16 · Today in AI");
    expect(subject).not.toContain("…");
    expect(subject).not.toContain("OpenAI");
    expect(subject.length).toBeLessThanOrEqual(40);
    expect(html).toContain(`<title>${subject}</title>`);
    expect(html).toContain(`>${subject}</td>`);
    expect(html).toContain(`opacity:0">${long}</div>`);
    expect(html).toContain('class="mail-hero"');
    expect(html).toContain(`src="${hero}"`);
    expect(html.match(/class="mail-hero"/g)?.length).toBe(1);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("127.0.0.1");
  });

  it("uses the first photo thumbnail and skips a generated OG card", () => {
    const { html } = buildDigestEmail(
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
    );
    const hero = html.match(/class="mail-hero" src="([^"]+)"/);
    expect(hero?.[1]).toBe("https://cdn.example/photos/claude-stage.jpg");
    expect(html).not.toContain(
      'class="mail-hero" src="https://marketbrief.now/og/'
    );
    expect(html).toContain(">Read on aidr.today</a>");
    expect(html).not.toMatch(/Read on aidr\.today[\s\S]{0,80}background/);
  });

  it("omits the hero image when no story image canonicalizes", () => {
    const { html } = buildDigestEmail(
      "2026-08-16",
      [{ text: "Plain story", image_url: "not a url" }],
      "en",
      "tok"
    );
    expect(html).not.toContain('class="mail-hero"');
  });
});

describe("digest subject in Vietnamese", () => {
  it("uses the Vietnamese label and never the English one", () => {
    const { subject, text } = buildDigestEmail(
      "2026-08-16",
      [{ text: "tin ".repeat(60) }],
      "vi",
      "tok"
    );
    expect(subject).toBe("AI;DR — 2026-08-16 · Tin AI hôm nay");
    expect(subject).not.toContain("…");
    expect(text.startsWith(`${subject}\n`)).toBe(true);
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
      'class="mail-hero" src="https://news.example/og/'
    );
    expect(html).toContain(
      'class="mail-hero" src="https://cdn.example/photos/room.jpg"'
    );
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
    expect(sentHtml[0]).toContain(
      'class="mail-hero" src="https://cdn.example/photos/room.jpg"'
    );
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
