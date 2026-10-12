import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadWeeklyMail,
  renderWeeklyEmail,
  sendDailyTldr,
  shouldSendWeeklyForSubscriber,
<<<<<<< HEAD
  WEEKLY_FALLBACK_HOUR,
} from "../subscribe/send.js";
import type { Env } from "../types.js";

const LINES = {
  item_ids: JSON.stringify(["a", "b", "c"]),
=======
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
>>>>>>> origin/master
  stories_en: JSON.stringify([
    { item_id: "a", text: "Lab A ships an open model." },
    { item_id: "b", text: "Chip B doubles memory." },
    { item_id: "c", text: "Startup C raises a round." },
  ]),
  stories_vi: "[]",
<<<<<<< HEAD
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
=======
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
>>>>>>> origin/master
  });
});

function makeEnv(opts: {
  subscribers: Array<Record<string, unknown>>;
<<<<<<< HEAD
  week?: Record<string, unknown> | null;
  digest?: Record<string, unknown> | null;
}) {
  const updates: { sql: string; args: unknown[] }[] = [];
  const reads: { sql: string; args: unknown[] }[] = [];
=======
  week?: typeof WEEK | null;
}) {
  const updates: { sql: string; args: unknown[] }[] = [];
>>>>>>> origin/master
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const db = {
    batch: async () => [],
    prepare(sql: string) {
<<<<<<< HEAD
      const bound = (args: unknown[] = []) => ({
        first: async () => {
          reads.push({ sql, args });
          if (sql.includes("FROM weekly_snapshots")) return opts.week ?? null;
          if (sql.includes("FROM weekly_digests")) return opts.digest ?? null;
=======
      const bound = () => ({
        first: async () => {
          if (sql.includes("FROM weekly_snapshots")) return opts.week ?? null;
>>>>>>> origin/master
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
<<<<<<< HEAD
          return bound(args);
=======
          return bound();
>>>>>>> origin/master
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
<<<<<<< HEAD
    reads,
=======
>>>>>>> origin/master
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
<<<<<<< HEAD
    weekly_day: 1,
=======
>>>>>>> origin/master
    ...over,
  };
}

describe("sendDailyTldr — weekly lane", () => {
  beforeEach(() => {
    vi.useFakeTimers();
<<<<<<< HEAD
=======
    // Monday 2026-10-12 10:00 ICT: week 2026-W41 has just closed.
    vi.setSystemTime(Date.UTC(2026, 9, 12, 3, 0, 0));
>>>>>>> origin/master
  });
  afterEach(() => {
    vi.useRealTimers();
  });
<<<<<<< HEAD
  const mondayMorning = Date.UTC(2026, 9, 12, 3, 0, 0); // 10:00 ICT
  const wednesdayMorning = Date.UTC(2026, 9, 14, 3, 0, 0);

  it("Monday: mails the ISO-week edition and stamps its end date", async () => {
    vi.setSystemTime(mondayMorning);
    const { env, sent, updates, reads } = makeEnv({
      subscribers: [sub()],
      week: WEEK_ROW,
    });
    expect(await sendDailyTldr(env)).toBe(1);
=======

  it("mails the weekly edition and stamps the week", async () => {
    const { env, sent, updates } = makeEnv({
      subscribers: [sub()],
      week: WEEK,
    });
    expect(await sendDailyTldr(env)).toBe(1);
    expect(sent).toHaveLength(1);
>>>>>>> origin/master
    expect(sent[0]?.subject).toBe("AI;DR Weekly #2 — Lab A open model");
    expect(sent[0]?.html).toContain("/week/2026-W41");
    expect(sent[0]?.html).toContain("A big week for open models.");
    expect(
<<<<<<< HEAD
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
=======
      updates.find((u) => u.sql.includes("last_weekly_sent"))?.args
    ).toEqual(["2026-W41", "w@aidr.today"]);
  });

  it("keeps daily subscribers off the weekly lane", async () => {
    const { env, sent } = makeEnv({
      subscribers: [sub({ frequency: "daily" }), sub({ frequency: null })],
      week: WEEK,
>>>>>>> origin/master
    });
    await sendDailyTldr(env);
    expect(sent).toEqual([]);
  });

  it("never sends English to a Vietnamese subscriber", async () => {
<<<<<<< HEAD
    vi.setSystemTime(mondayMorning);
    const { env, sent } = makeEnv({
      subscribers: [sub({ lang: "vi" })],
      week: WEEK_ROW,
=======
    const { env, sent } = makeEnv({
      subscribers: [sub({ lang: "vi" })],
      week: WEEK,
>>>>>>> origin/master
    });
    await sendDailyTldr(env);
    expect(sent).toEqual([]);
  });

<<<<<<< HEAD
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
=======
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
>>>>>>> origin/master
  });
});

describe("renderWeeklyEmail", () => {
  it("cuts to the digest size and leaves out the per-day feedback row", async () => {
<<<<<<< HEAD
    const { env } = makeEnv({ subscribers: [], week: WEEK_ROW });
    const mail = await loadWeeklyMail(env, "2026-10-11", "en", 3);
    expect(mail?.bullets.map((b) => b.item_id)).toEqual(["a", "b", "c"]);
    const small = await loadWeeklyMail(env, "2026-10-11", "en", 2);
=======
    const { env } = makeEnv({ subscribers: [], week: WEEK });
    const mail = await loadWeeklyMail(env, "2026-W41", "en", 3);
    expect(mail?.bullets.map((b) => b.item_id)).toEqual(["a", "b", "c"]);
    const small = await loadWeeklyMail(env, "2026-W41", "en", 2);
>>>>>>> origin/master
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
<<<<<<< HEAD

  it("a rolling digest has no issue number and links home", async () => {
    const { env } = makeEnv({ subscribers: [], digest: DIGEST_ROW });
    const mail = await loadWeeklyMail(env, "2026-10-13", "en", 5);
    expect(mail?.meta.week).toBeNull();
    const { text } = await renderWeeklyEmail(env, mail!, "en", "tok", "text");
    expect(text).toContain("AI;DR Weekly · Oct 7 – 13, 2026");
    expect(text).toContain("See the latest stories on aidr.today");
  });
=======
>>>>>>> origin/master
});
