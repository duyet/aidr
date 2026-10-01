/**
 * Notify runs last in the hourly Workflow, and the subrequest budget is per
 * Workflow instance: by then fetch, LLM and D1 work may have spent it, and
 * the runtime refuses every further fetch with "Too many subrequests". Before
 * this guard each refusal was a real attempt, so three starved runs abandoned
 * a day's digest for good (digest:2026-08-20/28/29 in production). Real SQLite,
 * real migrations, real dispatcher; only `fetch` is stubbed.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  digestKey,
  dispatchStoryNotifications,
  NOTIFY_MAX_ATTEMPTS,
} from "../notify/index.js";
import type { Env } from "../types.js";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

class SqliteD1 {
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
        const result = statement.run(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return prepared;
  }
}

// 10:00 in the audience timezone: after the digest hour.
const NOW = new Date("2026-10-01T03:00:00Z");
const DATE = "2026-10-01";

let sqlite: DatabaseSync;
let env: Env;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  const bullets = JSON.stringify([{ text: "A story", item_ids: [] }]);
  sqlite
    .prepare(
      "INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(DATE, bullets, bullets, NOW.getTime());
  env = {
    DB: new SqliteD1(sqlite) as unknown as D1Database,
    TELEGRAM_BOT_TOKEN: "token",
    TELEGRAM_VI_CHAT_ID: "@vi",
    TELEGRAM_EN_CHAT_ID: "@en",
  } as Env;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sqlite.close();
});

function digestRows() {
  return sqlite
    .prepare(
      "SELECT channel, status, attempts FROM notifications WHERE item_id = ? ORDER BY channel"
    )
    .all(digestKey(DATE)) as Array<{
    channel: string;
    status: string;
    attempts: number;
  }>;
}

const refused = () =>
  vi.fn(async () => {
    throw new Error(
      "Too many subrequests by single Worker invocation. To configure this limit, refer to https://developers.cloudflare.com/workers/wrangler/configuration/#limits"
    );
  });

const telegramOk = () =>
  vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), {
        headers: { "content-type": "application/json" },
      })
  );

describe("notify under an exhausted subrequest budget", () => {
  it("stops at the first refusal and keeps the digest for the next run", async () => {
    const fetchMock = refused();
    vi.stubGlobal("fetch", fetchMock);

    // More starved runs than the attempt cap: none may burn an attempt.
    for (let run = 0; run <= NOTIFY_MAX_ATTEMPTS; run++) {
      const report = await dispatchStoryNotifications(env);
      expect(Object.values(report.sent).every((n) => n === 0)).toBe(true);
    }

    // One refused call per run: the second channel never tries, since the
    // runtime would refuse it too.
    expect(fetchMock).toHaveBeenCalledTimes(NOTIFY_MAX_ATTEMPTS + 1);
    expect(digestRows()).toEqual([
      { channel: "telegram", status: "failed", attempts: 0 },
    ]);

    // Budget back: each channel posts its digest exactly once...
    const ok = telegramOk();
    vi.stubGlobal("fetch", ok);
    const sent = await dispatchStoryNotifications(env);
    expect(sent.sent).toMatchObject({ telegram: 1, "telegram-en": 1 });
    expect(ok).toHaveBeenCalledTimes(2);
    expect(digestRows().map((r) => r.status)).toEqual(["sent", "sent"]);

    // ...and a replay of the step posts nothing again.
    const replay = telegramOk();
    vi.stubGlobal("fetch", replay);
    await dispatchStoryNotifications(env);
    expect(replay).not.toHaveBeenCalled();
  });
});
