/**
 * #534: POST /api/subscribe with a confirmed subscriber's address used to
 * overwrite their settings, so anyone who knew the address could change
 * them. Now the settings wait for the mailbox owner to click a link, and the
 * response is the same as for a new address. Real SQLite and migrations;
 * only the EMAIL binding is stubbed.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureMailSchema, resetMailSchemaCache } from "../mail/schema.js";
import {
  confirmSubscription,
  settingsChangeFromParams,
  subscribe,
  unsubscribe,
} from "../subscribe/handlers.js";
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

  async batch(statements: { run: () => Promise<unknown> }[]) {
    for (const statement of statements) await statement.run();
    return [];
  }
}

const schedule = (job: Promise<unknown>) => void job;

const EMAIL = "reader@aidr-test.dev";

let sqlite: DatabaseSync;
let env: Env;
let sent: { to: string; subject: string; html: string }[];

function settings() {
  return sqlite
    .prepare(
      "SELECT lang, timezone, digest_size, mail_format, mail_font, confirmed FROM subscribers WHERE email = ?"
    )
    .get(EMAIL);
}

/** The CTA link in the last mail: `/api/subscribe/confirm?token=…&…`. */
function lastConfirmLink(): URL {
  const html = sent.at(-1)?.html ?? "";
  const match = html.match(/href="([^"]*\/api\/subscribe\/confirm\?[^"]*)"/);
  if (!match) throw new Error("no confirm link in mail");
  return new URL(match[1].replaceAll("&amp;", "&"));
}

beforeEach(async () => {
  sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  sent = [];
  env = {
    DB: new SqliteD1(sqlite) as unknown as D1Database,
    EMAIL: {
      send: async (msg: { to: string; subject: string; html: string }) => {
        sent.push(msg);
      },
    },
  } as unknown as Env;
  resetMailSchemaCache();
  await ensureMailSchema(env.DB);
  sqlite
    .prepare(
      `INSERT INTO subscribers (email, lang, timezone, created_at, confirmed, unsubscribe_token, digest_size, mail_format)
       VALUES (?, 'vi', 'Asia/Ho_Chi_Minh', 0, 1, 'tok-confirmed', 5, 'design')`
    )
    .run(EMAIL);
});

afterEach(() => {
  sqlite.close();
});

describe("subscribe with an already-confirmed address (#534)", () => {
  it("does not apply the posted settings, and mails a link that does", async () => {
    const before = settings();
    const result = await subscribe(
      env,
      EMAIL,
      "en",
      "Europe/Berlin",
      "home",
      null,
      10,
      "text",
      "serif",
      undefined,
      undefined,
      schedule
    );
    expect(result).toEqual({ ok: true, pending: true });
    expect(settings()).toEqual(before);

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].to).toBe(EMAIL);
    const link = lastConfirmLink();
    expect(link.searchParams.get("token")).toBe("tok-confirmed");

    const confirmed = await confirmSubscription(
      env,
      link.searchParams.get("token"),
      settingsChangeFromParams(link.searchParams),
      schedule
    );
    expect(confirmed).toEqual({ ok: true, token: "tok-confirmed" });
    expect(settings()).toEqual({
      lang: "en",
      timezone: "Europe/Berlin",
      digest_size: 10,
      mail_format: "text",
      mail_font: "serif",
      confirmed: 1,
    });
  });

  it("answers exactly as it does for a new address", async () => {
    const forConfirmed = await subscribe(
      env,
      EMAIL,
      "en",
      undefined,
      undefined,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      schedule
    );
    const forNew = await subscribe(
      env,
      "new@aidr-test.dev",
      "en",
      undefined,
      undefined,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      schedule
    );
    expect(forConfirmed).toEqual(forNew);
  });

  it("leaves the new-subscriber flow unchanged: pending row with the posted settings", async () => {
    await subscribe(
      env,
      "new@aidr-test.dev",
      "en",
      "Europe/Berlin",
      "home",
      null,
      3,
      "text",
      "serif",
      undefined,
      undefined,
      schedule
    );
    expect(
      sqlite
        .prepare(
          "SELECT lang, timezone, digest_size, mail_format, mail_font, confirmed FROM subscribers WHERE email = ?"
        )
        .get("new@aidr-test.dev")
    ).toEqual({
      lang: "en",
      timezone: "Europe/Berlin",
      digest_size: 3,
      mail_format: "text",
      mail_font: "serif",
      confirmed: 0,
    });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(settingsChangeFromParams(lastConfirmLink().searchParams)).toBe(
      undefined
    );
  });
});

describe("subscription mails outlive the response (#626)", () => {
  let jobs: Promise<unknown>[];
  const collect = (job: Promise<unknown>) => {
    jobs.push(job);
  };
  const failSends = () => {
    (env.EMAIL as unknown as { send: () => Promise<never> }).send =
      async () => {
        throw new Error("EMAIL down");
      };
    vi.spyOn(console, "error").mockImplementation(() => {});
  };
  const subscribeNew = (address: string) =>
    subscribe(
      env,
      address,
      "en",
      undefined,
      undefined,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      collect
    );

  beforeEach(() => {
    jobs = [];
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hands the settings-change mail to waitUntil, and a failed send does not fail the response", async () => {
    failSends();
    const result = await subscribeNew(EMAIL);
    expect(result).toEqual({ ok: true, pending: true });
    expect(jobs).toHaveLength(1);
    await expect(Promise.all(jobs)).resolves.toBeDefined();
  });

  it("hands the confirmation mail to waitUntil, and a failed send does not fail the response", async () => {
    failSends();
    const result = await subscribeNew("new@aidr-test.dev");
    expect(result).toEqual({ ok: true, pending: true });
    expect(jobs).toHaveLength(1);
    await expect(Promise.all(jobs)).resolves.toBeDefined();
  });

  it("hands the welcome mail and the owner notification to waitUntil, and failures do not fail the confirmation", async () => {
    sqlite
      .prepare("UPDATE subscribers SET confirmed = 0 WHERE email = ?")
      .run(EMAIL);
    failSends();
    const result = await confirmSubscription(
      env,
      "tok-confirmed",
      undefined,
      collect
    );
    expect(result).toEqual({ ok: true, token: "tok-confirmed" });
    expect(jobs).toHaveLength(2);
    await expect(Promise.all(jobs)).resolves.toBeDefined();
  });
});

describe("unsubscribe, then subscribe again (#723)", () => {
  const ADDRESS = "again@aidr-test.dev";
  const signUp = async () => {
    await subscribe(
      env,
      ADDRESS,
      "en",
      undefined,
      undefined,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      schedule
    );
    const { unsubscribe_token: token } = sqlite
      .prepare("SELECT unsubscribe_token FROM subscribers WHERE email = ?")
      .get(ADDRESS) as { unsubscribe_token: string };
    await confirmSubscription(env, token, undefined, schedule);
    return token;
  };
  const row = () =>
    sqlite
      .prepare("SELECT confirmed FROM subscribers WHERE email = ?")
      .get(ADDRESS);

  it("a link from the old subscription cannot remove the new one", async () => {
    env = { ...env, NEWS_UNSUBSCRIBE_SECRET: "test-secret" };
    const first = await signUp();
    await unsubscribe(env, first);
    expect(row()).toBeUndefined();

    await signUp();
    await unsubscribe(env, first);
    expect(row()).toEqual({ confirmed: 1 });
  });
});

describe("signing up again while pending (#723)", () => {
  const ADDRESS = "pending@aidr-test.dev";
  const signUp = () =>
    subscribe(
      env,
      ADDRESS,
      "en",
      undefined,
      undefined,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      schedule
    );
  const storedToken = () =>
    (
      sqlite
        .prepare("SELECT unsubscribe_token FROM subscribers WHERE email = ?")
        .get(ADDRESS) as { unsubscribe_token: string }
    ).unsubscribe_token;
  const flushMail = () => new Promise((resolve) => setTimeout(resolve, 10));

  it("keeps the stored token, mails it both times, and it still confirms", async () => {
    env = { ...env, NEWS_UNSUBSCRIBE_SECRET: "test-secret" };

    await signUp();
    await flushMail();
    const first = storedToken();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(lastConfirmLink().searchParams.get("token")).toBe(first);

    await signUp();
    await flushMail();
    expect(sent).toHaveLength(2);
    expect(storedToken()).toBe(first);
    expect(lastConfirmLink().searchParams.get("token")).toBe(first);

    await expect(
      confirmSubscription(env, first, undefined, schedule)
    ).resolves.toEqual({ ok: true, token: first });
  });
});

describe("unsubscribe erases the reader everywhere (#833)", () => {
  const TOKEN = "tok-confirmed";
  const OTHER = "other@aidr-test.dev";

  function tablesHolding(needle: string): string[] {
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as { name: string }[];
    return tables
      .filter(({ name }) => {
        const columns = sqlite
          .prepare(`SELECT name FROM pragma_table_info('${name}')`)
          .all() as { name: string }[];
        if (columns.length === 0) return false;
        const hit = columns
          .map(({ name: col }) => `instr(CAST("${col}" AS TEXT), ?) > 0`)
          .join(" OR ");
        return (
          sqlite
            .prepare(`SELECT 1 FROM "${name}" WHERE ${hit} LIMIT 1`)
            .get(...columns.map(() => needle)) !== undefined
        );
      })
      .map(({ name }) => name);
  }

  it("leaves no table holding the address or the token, and keeps other readers", async () => {
    sqlite
      .prepare(
        `INSERT INTO subscribers (email, lang, timezone, created_at, confirmed, unsubscribe_token, digest_size, mail_format)
         VALUES (?, 'en', 'UTC', 0, 1, 'tok-other', 5, 'design')`
      )
      .run(OTHER);
    for (const email of [EMAIL, OTHER]) {
      sqlite
        .prepare(
          "INSERT INTO subscriber_sources (email, source, updated_at) VALUES (?, 'home', 1)"
        )
        .run(email);
      sqlite
        .prepare(
          "INSERT INTO email_sends (campaign_id, email, sent_at) VALUES ('c1', ?, 1)"
        )
        .run(email);
    }
    for (const token of [TOKEN, "tok-other"]) {
      sqlite
        .prepare(
          "INSERT INTO email_feedback (date, subscriber_token, lang, vote, created_at, updated_at) VALUES ('2026-10-16', ?, 'en', 1, 1, 1)"
        )
        .run(token);
    }
    expect(tablesHolding(EMAIL).sort()).toEqual([
      "email_sends",
      "subscriber_sources",
      "subscribers",
    ]);
    expect(tablesHolding(TOKEN).sort()).toEqual([
      "email_feedback",
      "subscribers",
    ]);

    expect(await unsubscribe(env, TOKEN)).toEqual({ ok: true });

    expect(tablesHolding(EMAIL)).toEqual([]);
    expect(tablesHolding(TOKEN)).toEqual([]);
    expect(tablesHolding(OTHER).sort()).toEqual([
      "email_sends",
      "subscriber_sources",
      "subscribers",
    ]);
    expect(tablesHolding("tok-other").sort()).toEqual([
      "email_feedback",
      "subscribers",
    ]);
  });
});
