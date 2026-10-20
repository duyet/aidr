/**
 * #976: the digest lanes claim a subscriber's stamp before mailing, so a
 * failed stamp write can never lead to a second copy of the same edition,
 * and one subscriber's error never stops the rest of the run. Real SQLite
 * and migrations; only the EMAIL binding is stubbed.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureMailSchema, resetMailSchemaCache } from "../mail/schema.js";
import { sendDailyTldr } from "../subscribe/send.js";
import type { Env } from "../types.js";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

class SqliteD1 {
  failOnce: { sql: RegExp; email: string } | null = null;

  constructor(readonly db: DatabaseSync) {}

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: SqliteInput[] = [];
    const prepared = {
      bind: (...next: unknown[]) => {
        args = next as SqliteInput[];
        return prepared;
      },
      all: async () => ({ results: statement.all(...args) as unknown[] }),
      first: async () => statement.get(...args) ?? null,
      run: async () => {
        const fail = this.failOnce;
        if (fail?.sql.test(sql) && args.includes(fail.email)) {
          this.failOnce = null;
          throw new Error("D1_ERROR: network connection lost");
        }
        const result = statement.run(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return prepared;
  }

  async batch(statements: { run: () => Promise<unknown> }[]) {
    for (const statement of statements) await statement.run();
    return [];
  }
}

const EN = "en@aidr-test.dev";
const VI = "vi@aidr-test.dev";
const WEEKLY = "weekly@aidr-test.dev";
const SUNDAY = 0;

let sqlite: DatabaseSync;
let d1: SqliteD1;
let env: Env;
let sent: string[];

function addSubscriber(email: string, lang: "en" | "vi", frequency: string) {
  sqlite
    .prepare(
      `INSERT INTO subscribers (email, lang, timezone, created_at, confirmed, unsubscribe_token, frequency, weekly_day)
       VALUES (?, ?, 'Asia/Ho_Chi_Minh', 0, 1, ?, ?, ?)`
    )
    .run(email, lang, `tok-${email}`, frequency, SUNDAY);
}

const mailsTo = (email: string) => sent.filter((to) => to === email).length;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 7, 16, 3, 0, 0));
  vi.spyOn(console, "error").mockImplementation(() => {});
  sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  sqlite
    .prepare(
      "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at) VALUES ('2026-08-16', ?, ?, 0)"
    )
    .run(
      JSON.stringify([{ text: "story" }]),
      JSON.stringify([{ text: "tin tức" }])
    );
  sqlite
    .prepare(
      `INSERT INTO weekly_digests (end_date, start_date, item_ids, stories_en, created_at, updated_at)
       VALUES ('2026-08-15', '2026-08-09', ?, ?, 0, 0)`
    )
    .run(
      JSON.stringify(["a"]),
      JSON.stringify([{ item_id: "a", text: "Lab A ships." }])
    );
  sent = [];
  d1 = new SqliteD1(sqlite);
  env = {
    DB: d1 as unknown as D1Database,
    EMAIL: {
      send: async (msg: { to: string }) => {
        sent.push(msg.to);
      },
    },
  } as unknown as Env;
  resetMailSchemaCache();
  await ensureMailSchema(env.DB);
  addSubscriber(EN, "en", "daily");
  addSubscriber(VI, "vi", "daily");
  addSubscriber(WEEKLY, "en", "weekly");
});

afterEach(() => {
  sqlite.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("digest stamp write fails (#976)", () => {
  it("mails the daily reader once across runs, and the other lanes still go out", async () => {
    d1.failOnce = { sql: /^UPDATE subscribers SET last_sent_date/, email: EN };
    await sendDailyTldr(env);
    expect(mailsTo(VI)).toBe(1);
    expect(mailsTo(WEEKLY)).toBe(1);

    await sendDailyTldr(env);
    await sendDailyTldr(env);
    expect(mailsTo(EN)).toBe(1);
    expect(mailsTo(VI)).toBe(1);
    expect(mailsTo(WEEKLY)).toBe(1);
  });

  it("mails the weekly reader once across runs", async () => {
    d1.failOnce = {
      sql: /^UPDATE subscribers SET last_weekly_sent/,
      email: WEEKLY,
    };
    for (let run = 0; run < 3; run++) await sendDailyTldr(env);
    expect(mailsTo(WEEKLY)).toBe(1);
  });
});

describe("digest send fails (#976)", () => {
  it("leaves the reader unstamped, so the next run retries", async () => {
    let failing = true;
    env.EMAIL = {
      send: async (msg: { to: string }) => {
        if (failing && (msg.to === EN || msg.to === WEEKLY)) {
          throw new Error("send failed");
        }
        sent.push(msg.to);
      },
    } as unknown as Env["EMAIL"];
    await sendDailyTldr(env);
    expect(sent).toEqual([VI]);

    failing = false;
    await sendDailyTldr(env);
    await sendDailyTldr(env);
    expect(sent.sort()).toEqual([EN, VI, WEEKLY].sort());
  });
});
