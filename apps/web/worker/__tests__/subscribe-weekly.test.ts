import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadWeeklyMail,
  renderWeeklyEmail,
  sendDailyTldr,
  shouldSendWeeklyForSubscriber,
  WEEKLY_FALLBACK_HOUR,
} from "../subscribe/send.js";
import type { Env } from "../types.js";

const LINES = {
  item_ids: JSON.stringify(["a", "b", "c"]),
  stories_en: JSON.stringify([
    { item_id: "a", text: "Lab A ships an open model." },
    { item_id: "b", text: "Chip B doubles memory." },
    { item_id: "c", text: "Startup C raises a round." },
  ]),
  stories_vi: "[]",
  intro_vi: null as string | null,
  fallback: 0,
};
/** ISO week 2026-W41 (Mon 5 – Sun 11 Oct): Monday senders. */
const WEEK_ROW = {
  ...LINES,
  start_date: "2026-10-05",
  end_date: "2026-10-11",
  intro_en: "A big week for open models.",
};
/** Rolling window Wed 7 – Tue 13 Oct: Wednesday senders. */
const DIGEST_ROW = {
  ...LINES,
  start_date: "2026-10-07",
  end_date: "2026-10-13",
  intro_en: "Seven days of chips and models.",
};

describe("shouldSendWeeklyForSubscriber", () => {
  const monday = "2026-10-12";
  const fresh = { last_weekly_sent: null, weekly_day: 1 };

  it("sends only on the subscriber's weekday, from the digest hour", () => {
    expect(shouldSendWeeklyForSubscriber(fresh, 6, monday)).toBe(false);
    expect(shouldSendWeeklyForSubscriber(fresh, 7, monday)).toBe(true);
    expect(
      shouldSendWeeklyForSubscriber({ ...fresh, weekly_day: 3 }, 9, monday)
    ).toBe(false);
    expect(
      shouldSendWeeklyForSubscriber(
        { ...fresh, weekly_day: 3 },
        9,
        "2026-10-14"
      )
    ).toBe(true);
  });

  it("defaults to Monday when no day is stored", () => {
    expect(
      shouldSendWeeklyForSubscriber({ last_weekly_sent: null }, 9, monday)
    ).toBe(true);
  });

  it("sends a window once and never overlapping windows back to back", () => {
    const sent = (last: string) =>
      shouldSendWeeklyForSubscriber(
        { ...fresh, last_weekly_sent: last },
        9,
        monday
      );
    expect(sent("2026-10-11")).toBe(false); // this window
    expect(sent("2026-10-07")).toBe(false); // moved from Thursday: overlap
    expect(sent("2026-10-04")).toBe(true); // last Monday's window
    expect(sent("2026-W40")).toBe(true); // legacy week key is ignored
  });

  it("holds a title-only fallback digest until the afternoon", () => {
    expect(
      shouldSendWeeklyForSubscriber(fresh, 9, monday, { fallback: true })
    ).toBe(false);
    expect(
      shouldSendWeeklyForSubscriber(fresh, WEEKLY_FALLBACK_HOUR, monday, {
        fallback: true,
      })
    ).toBe(true);
  });
});

function makeEnv(opts: {
  subscribers: Array<Record<string, unknown>>;
  week?: Record<string, unknown> | null;
  digest?: Record<string, unknown> | null;
}) {
  const updates: { sql: string; args: unknown[] }[] = [];
  const reads: { sql: string; args: unknown[] }[] = [];
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const db = {
    batch: async () => [],
    prepare(sql: string) {
      const bound = (args: unknown[] = []) => ({
        first: async () => {
          reads.push({ sql, args });
          if (sql.includes("FROM weekly_snapshots")) return opts.week ?? null;
          if (sql.includes("FROM weekly_digests")) return opts.digest ?? null;
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
          return bound(args);
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
    reads,
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
    weekly_day: 1,
    ...over,
  };
}

describe("sendDailyTldr — weekly lane", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const mondayMorning = Date.UTC(2026, 9, 12, 3, 0, 0); // 10:00 ICT
  const wednesdayMorning = Date.UTC(2026, 9, 14, 3, 0, 0);

  it("Monday: mails the ISO-week edition and stamps its end date", async () => {
    vi.setSystemTime(mondayMorning);
    const { env, sent, updates, reads } = makeEnv({
      subscribers: [sub()],
      week: WEEK_ROW,
    });
    expect(await sendDailyTldr(env)).toBe(1);
    expect(sent[0]?.subject).toBe("AI;DR Weekly #2 — Lab A open model");
    expect(sent[0]?.html).toContain("/week/2026-W41");
    expect(sent[0]?.html).toContain("A big week for open models.");
    expect(
      reads.find((r) => r.sql.includes("FROM weekly_snapshots"))?.args
    ).toEqual(["2026-W41"]);
    expect(
      updates.find((u) => u.sql.includes("last_weekly_sent"))?.args
    ).toEqual(["2026-10-11", "w@aidr.today"]);
  });

  it("Wednesday: mails the shared rolling digest of the 7 days before", async () => {
    vi.setSystemTime(wednesdayMorning);
    const { env, sent, updates, reads } = makeEnv({
      subscribers: [
        sub({ weekly_day: 3 }),
        sub({ email: "x@aidr.today", weekly_day: 3 }),
        sub({ email: "monday@aidr.today", weekly_day: 1 }),
      ],
      digest: DIGEST_ROW,
    });
    expect(await sendDailyTldr(env)).toBe(2);
    expect(sent.map((m) => m.to)).toEqual(["w@aidr.today", "x@aidr.today"]);
    expect(sent[0]?.subject).toBe("AI;DR Weekly — Lab A open model");
    expect(sent[0]?.html).not.toContain("/week/");
    // One read of the shared digest for both subscribers.
    expect(
      reads
        .filter((r) => r.sql.includes("FROM weekly_digests"))
        .map((r) => r.args)
    ).toEqual([["2026-10-13"]]);
    expect(
      updates
        .filter((u) => u.sql.includes("last_weekly_sent"))
        .map((u) => u.args[0])
    ).toEqual(["2026-10-13", "2026-10-13"]);
  });

  it("keeps daily subscribers off the weekly lane", async () => {
    vi.setSystemTime(mondayMorning);
    const { env, sent } = makeEnv({
      subscribers: [sub({ frequency: "daily" }), sub({ frequency: null })],
      week: WEEK_ROW,
    });
    await sendDailyTldr(env);
    expect(sent).toEqual([]);
  });

  it("never sends English to a Vietnamese subscriber", async () => {
    vi.setSystemTime(mondayMorning);
    const { env, sent } = makeEnv({
      subscribers: [sub({ lang: "vi" })],
      week: WEEK_ROW,
    });
    await sendDailyTldr(env);
    expect(sent).toEqual([]);
  });

  it("waits while the digest is not built yet", async () => {
    vi.setSystemTime(wednesdayMorning);
    const { env, sent, updates } = makeEnv({
      subscribers: [sub({ weekly_day: 3 })],
      digest: null,
    });
    await sendDailyTldr(env);
    expect(sent).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("a failed send is not stamped and does not stop the others", async () => {
    vi.setSystemTime(mondayMorning);
    const { env, sent, updates } = makeEnv({
      subscribers: [sub({ email: "bad@aidr.today" }), sub()],
      week: WEEK_ROW,
    });
    const send = (
      env as unknown as { EMAIL: { send: (m: unknown) => Promise<void> } }
    ).EMAIL;
    const ok = send.send;
    send.send = async (m: unknown) => {
      if ((m as { to: string }).to === "bad@aidr.today") throw new Error("x");
      return ok(m);
    };
    await sendDailyTldr(env);
    expect(sent.map((m) => m.to)).toEqual(["w@aidr.today"]);
    expect(
      updates
        .filter((u) => u.sql.includes("last_weekly_sent"))
        .map((u) => u.args[1])
    ).toEqual(["w@aidr.today"]);
  });
});

describe("renderWeeklyEmail", () => {
  it("cuts to the digest size and leaves out the per-day feedback row", async () => {
    const { env } = makeEnv({ subscribers: [], week: WEEK_ROW });
    const mail = await loadWeeklyMail(env, "2026-10-11", "en", 3);
    expect(mail?.bullets.map((b) => b.item_id)).toEqual(["a", "b", "c"]);
    const small = await loadWeeklyMail(env, "2026-10-11", "en", 2);
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

  it("a rolling digest has no issue number and links home", async () => {
    const { env } = makeEnv({ subscribers: [], digest: DIGEST_ROW });
    const mail = await loadWeeklyMail(env, "2026-10-13", "en", 5);
    expect(mail?.meta.week).toBeNull();
    const { text } = await renderWeeklyEmail(env, mail!, "en", "tok", "text");
    expect(text).toContain("AI;DR Weekly · Oct 7 – 13, 2026");
    expect(text).toContain("See the latest stories on aidr.today");
  });
});

describe("rolling digest masthead and footer", () => {
  it("names the window instead of an issue and says one email a week", async () => {
    const { env } = makeEnv({ subscribers: [], digest: DIGEST_ROW });
    const mail = await loadWeeklyMail(env, "2026-10-13", "en", 5);
    const { html } = await renderWeeklyEmail(env, mail!, "en", "tok", "design");
    expect(html).not.toContain("Issue null");
    expect(html).not.toContain("#null");
    expect(html).toContain("Last 7 days");
    expect(html).toContain("One email a week.");
    expect(html).not.toContain("One email a day.");
  });
});
