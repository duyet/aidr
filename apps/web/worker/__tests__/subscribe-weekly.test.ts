import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadWeeklyMail,
  renderWeeklyEmail,
  sendDailyTldr,
  shouldSendWeeklyForSubscriber,
  WEEKLY_SEND_WINDOW_DAYS,
} from "../subscribe/send.js";
import type { Env } from "../types.js";

const WEEK = {
  week: "2026-W41",
  issue: 2,
  start_date: "2026-10-05",
  end_date: "2026-10-11",
  item_ids: JSON.stringify(["a", "b", "c"]),
  intro_en: "A big week for open models.",
  intro_vi: null as string | null,
  stories_en: JSON.stringify([
    { item_id: "a", text: "Lab A ships an open model." },
    { item_id: "b", text: "Chip B doubles memory." },
    { item_id: "c", text: "Startup C raises a round." },
  ]),
  stories_vi: "[]",
  fallback: 0,
};

describe("shouldSendWeeklyForSubscriber", () => {
  const edition = { week: "2026-W41", end_date: "2026-10-11" };
  const fresh = { last_weekly_sent: null };

  it("waits for the digest hour", () => {
    expect(shouldSendWeeklyForSubscriber(fresh, 6, "2026-10-12", edition)).toBe(
      false
    );
    expect(shouldSendWeeklyForSubscriber(fresh, 7, "2026-10-12", edition)).toBe(
      true
    );
  });

  it("never sends the week before its Sunday is over locally", () => {
    expect(shouldSendWeeklyForSubscriber(fresh, 9, "2026-10-11", edition)).toBe(
      false
    );
  });

  it("sends once per week", () => {
    expect(
      shouldSendWeeklyForSubscriber(
        { last_weekly_sent: "2026-W41" },
        9,
        "2026-10-12",
        edition
      )
    ).toBe(false);
  });

  it("drops a stale edition after the window", () => {
    const last = `2026-10-${11 + WEEKLY_SEND_WINDOW_DAYS}`;
    const late = `2026-10-${12 + WEEKLY_SEND_WINDOW_DAYS}`;
    expect(shouldSendWeeklyForSubscriber(fresh, 9, last, edition)).toBe(true);
    expect(shouldSendWeeklyForSubscriber(fresh, 9, late, edition)).toBe(false);
  });

  it("holds a title-only fallback until the last day of the window", () => {
    const fallback = { ...edition, fallback: true };
    expect(
      shouldSendWeeklyForSubscriber(fresh, 9, "2026-10-12", fallback)
    ).toBe(false);
    const last = `2026-10-${11 + WEEKLY_SEND_WINDOW_DAYS}`;
    expect(shouldSendWeeklyForSubscriber(fresh, 9, last, fallback)).toBe(true);
  });
});

function makeEnv(opts: {
  subscribers: Array<Record<string, unknown>>;
  week?: typeof WEEK | null;
}) {
  const updates: { sql: string; args: unknown[] }[] = [];
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const db = {
    batch: async () => [],
    prepare(sql: string) {
      const bound = () => ({
        first: async () => {
          if (sql.includes("FROM weekly_snapshots")) return opts.week ?? null;
          return null; // no daily snapshot: only the weekly lane can send
        },
        all: async () => ({
          results: sql.includes("FROM items")
            ? [{ id: "a", title: "Lab A open model", url: "https://a.dev/x" }]
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
    send: async (m: { to: string; subject: string; html: string }) => {
      sent.push(m);
    },
  };
  return {
    env: { DB: db, EMAIL: email } as unknown as Env,
    updates,
    sent,
  };
}

function sub(over: Record<string, unknown> = {}) {
  return {
    email: "w@aidr.today",
    lang: "en",
    unsubscribe_token: "tok",
    timezone: "Asia/Ho_Chi_Minh",
    last_sent_date: null,
    digest_size: 5,
    mail_format: "design",
    frequency: "weekly",
    last_weekly_sent: null,
    ...over,
  };
}

describe("sendDailyTldr — weekly lane", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Monday 2026-10-12 10:00 ICT: week 2026-W41 has just closed.
    vi.setSystemTime(Date.UTC(2026, 9, 12, 3, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mails the weekly edition and stamps the week", async () => {
    const { env, sent, updates } = makeEnv({
      subscribers: [sub()],
      week: WEEK,
    });
    expect(await sendDailyTldr(env)).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe("AI;DR Weekly #2 — Lab A open model");
    expect(sent[0]?.html).toContain("/week/2026-W41");
    expect(sent[0]?.html).toContain("A big week for open models.");
    expect(
      updates.find((u) => u.sql.includes("last_weekly_sent"))?.args
    ).toEqual(["2026-W41", "w@aidr.today"]);
  });

  it("keeps daily subscribers off the weekly lane", async () => {
    const { env, sent } = makeEnv({
      subscribers: [sub({ frequency: "daily" }), sub({ frequency: null })],
      week: WEEK,
    });
    await sendDailyTldr(env);
    expect(sent).toEqual([]);
  });

  it("never sends English to a Vietnamese subscriber", async () => {
    const { env, sent } = makeEnv({
      subscribers: [sub({ lang: "vi" })],
      week: WEEK,
    });
    await sendDailyTldr(env);
    expect(sent).toEqual([]);
  });

  it("skips a subscriber already sent this week", async () => {
    const { env, sent } = makeEnv({
      subscribers: [sub({ last_weekly_sent: "2026-W41" })],
      week: WEEK,
    });
    await sendDailyTldr(env);
    expect(sent).toEqual([]);
  });

  it("waits when the week has no edition yet", async () => {
    const { env, sent } = makeEnv({ subscribers: [sub()], week: null });
    await sendDailyTldr(env);
    expect(sent).toEqual([]);
  });
});

describe("renderWeeklyEmail", () => {
  it("cuts to the digest size and leaves out the per-day feedback row", async () => {
    const { env } = makeEnv({ subscribers: [], week: WEEK });
    const mail = await loadWeeklyMail(env, "2026-W41", "en", 3);
    expect(mail?.bullets.map((b) => b.item_id)).toEqual(["a", "b", "c"]);
    const small = await loadWeeklyMail(env, "2026-W41", "en", 2);
    expect(small?.bullets).toHaveLength(2);
    const { html, text } = await renderWeeklyEmail(
      env,
      mail!,
      "en",
      "tok",
      "design"
    );
    expect(html).toContain("Also this week");
    expect(html).not.toContain("/feedback?");
    expect(text).toContain("AI;DR Weekly #2 · Oct 5 – 11, 2026");
    expect(text).toContain("Read the full week on aidr.today");
  });
});
