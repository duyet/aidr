import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { unsubscribe } from "../subscribe/handlers.js";
import {
  type SubscriberRow,
  sendEmailLane,
  sendWeeklyLane,
} from "../subscribe/send.js";
import type { Env } from "../types.js";

const { sendSubscriberEmail, loadEdition } = vi.hoisted(() => ({
  sendSubscriberEmail: vi.fn(),
  loadEdition: vi.fn(),
}));

vi.mock("../mail/send.js", async (original) => ({
  ...(await original<typeof import("../mail/send.js")>()),
  sendSubscriberEmail,
}));
vi.mock("../digest/edition.js", async (original) => ({
  ...(await original<typeof import("../digest/edition.js")>()),
  loadEdition,
}));

const MIGRATION = readFileSync(
  new URL("../../migrations/0069_mail_daily_stats.sql", import.meta.url),
  "utf8"
);

/** Minimal D1 over node:sqlite; same shape as backfill-content.test.ts. */
function sqliteD1(sqlite: DatabaseSync) {
  type Input = null | number | bigint | string | NodeJS.ArrayBufferView;
  type Prepared = { run: () => Promise<unknown> };
  return {
    batch: async (statements: Prepared[]) => {
      const results: unknown[] = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let args: Input[] = [];
      const prepared = {
        bind: (...next: unknown[]) => {
          args = next as Input[];
          return prepared;
        },
        all: async () => ({ results: statement.all(...args) as unknown[] }),
        first: async () => statement.get(...args) ?? null,
        run: async () => ({
          success: true,
          meta: { changes: Number(statement.run(...args).changes) },
        }),
      };
      return prepared;
    },
  } as unknown as D1Database;
}

// 2026-10-16 09:00 UTC is 07:00+ locally for the default timezone.
const NOW = Date.UTC(2026, 9, 16, 9, 0, 0);
const DAY = "2026-10-16";

function setup(opts: { withStats?: boolean } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE subscribers (
    email TEXT PRIMARY KEY, lang TEXT, unsubscribe_token TEXT, timezone TEXT,
    last_sent_date TEXT, last_weekly_sent TEXT, confirmed INTEGER DEFAULT 1,
    digest_size INTEGER, mail_format TEXT, frequency TEXT, weekly_day INTEGER);
    CREATE TABLE day_videos (date TEXT, lang TEXT, youtube_id TEXT, short_id TEXT, title TEXT);
    CREATE TABLE subscriber_sources (email TEXT, source TEXT);
    CREATE TABLE email_sends (email TEXT);
    CREATE TABLE email_feedback (subscriber_token TEXT);
    INSERT INTO subscribers (email, lang, unsubscribe_token, timezone)
      VALUES ('a@example.com', 'en', 'tok-a', 'UTC'),
             ('b@example.com', 'en', 'tok-b', 'UTC');`);
  if (opts.withStats !== false) sqlite.exec(MIGRATION);
  const env = { DB: sqliteD1(sqlite) } as unknown as Env;
  const rows = () =>
    sqlite
      .prepare("SELECT * FROM subscribers ORDER BY email")
      .all() as unknown as SubscriberRow[];
  const stats = () =>
    sqlite
      .prepare(
        "SELECT date, lang, sent, failed, unsubscribed FROM mail_daily_stats"
      )
      .all();
  return { sqlite, env, rows, stats };
}

describe("mail_daily_stats", () => {
  beforeEach(() => {
    sendSubscriberEmail.mockReset().mockResolvedValue(true);
    loadEdition.mockReset().mockResolvedValue({
      date: DAY,
      lang: "en",
      bullets: [],
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("counts a send once per subscriber (defect: sends never counted)", async () => {
    const { env, rows, stats } = setup();
    await sendEmailLane(env, "en", rows(), NOW, new Map());
    expect(stats()).toEqual([
      { date: DAY, lang: "en", sent: 2, failed: 0, unsubscribed: 0 },
    ]);
  });

  it("does not double-count a retry of the same send (defect: sent counted per attempt)", async () => {
    const { env, rows, stats } = setup();
    // The first run mailed both, then died before the run recorded anything
    // else. The retry reads the same pre-stamp rows and mails again, but the
    // stamp is already set, so it moves nothing and counts nothing.
    const stale = rows();
    await sendEmailLane(env, "en", stale, NOW, new Map());
    await sendEmailLane(env, "en", stale, NOW, new Map());
    expect(sendSubscriberEmail).toHaveBeenCalledTimes(4);
    expect(stats()).toEqual([
      { date: DAY, lang: "en", sent: 2, failed: 0, unsubscribed: 0 },
    ]);
  });

  it("counts a failed send as failed, not sent", async () => {
    const { env, rows, stats } = setup();
    sendSubscriberEmail.mockResolvedValueOnce(false);
    await sendEmailLane(env, "en", rows(), NOW, new Map());
    expect(stats()).toEqual([
      { date: DAY, lang: "en", sent: 1, failed: 1, unsubscribed: 0 },
    ]);
  });

  it("counts a weekly send once across a retry", async () => {
    const { sqlite, env, rows, stats } = setup();
    sqlite.exec("UPDATE subscribers SET frequency = 'weekly', weekly_day = 1");
    sqlite.exec(`CREATE TABLE weekly_snapshots (week TEXT, start_date TEXT,
      end_date TEXT, item_ids TEXT, intro_en TEXT, intro_vi TEXT,
      stories_en TEXT, stories_vi TEXT, fallback INTEGER);
      CREATE TABLE weekly_digests (start_date TEXT, end_date TEXT, item_ids TEXT,
      intro_en TEXT, intro_vi TEXT, stories_en TEXT, stories_vi TEXT, fallback INTEGER);
      INSERT INTO weekly_snapshots VALUES ('2026-W41', '2026-10-05', '2026-10-11',
        '["x"]', NULL, NULL, '[{"item_id":"x","text":"Story."}]', '[]', 0);`);
    sqlite.exec("DELETE FROM subscribers WHERE email = 'b@example.com'");
    const monday = Date.UTC(2026, 9, 12, 9, 0, 0);
    const stale = rows();
    await sendWeeklyLane(env, stale, monday);
    await sendWeeklyLane(env, stale, monday);
    expect(stats()).toEqual([
      { date: "2026-10-12", lang: "en", sent: 1, failed: 0, unsubscribed: 0 },
    ]);
  });

  it("counts an unsubscribe once, not per click (defect: repeat click counted)", async () => {
    const { env, stats } = setup();
    await unsubscribe(env, "tok-a");
    await unsubscribe(env, "tok-a");
    await unsubscribe(env, "no-such-token");
    const rowsNow = stats() as { lang: string; unsubscribed: number }[];
    expect(rowsNow).toHaveLength(1);
    expect(rowsNow[0]).toMatchObject({ lang: "en", unsubscribed: 1 });
  });

  it("still sends and stamps before migration 0069 (defect: missing table aborts the lane)", async () => {
    const { sqlite, env, rows } = setup({ withStats: false });
    const result = await sendEmailLane(env, "en", rows(), NOW, new Map());
    expect(result.sent).toBe(2);
    expect(
      sqlite.prepare("SELECT last_sent_date FROM subscribers").all()
    ).toEqual([{ last_sent_date: DAY }, { last_sent_date: DAY }]);
    await expect(unsubscribe(env, "tok-a")).resolves.toEqual({ ok: true });
  });
});
