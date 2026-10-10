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

const EMAIL = "reader@aidr-test.dev";

let sqlite: DatabaseSync;
let env: Env;
let sent: { to: string; subject: string; html: string }[];

function settings() {
  return sqlite
    .prepare(
      "SELECT lang, timezone, digest_size, mail_format, confirmed FROM subscribers WHERE email = ?"
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
      "text"
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
      settingsChangeFromParams(link.searchParams)
    );
    expect(confirmed).toEqual({ ok: true, token: "tok-confirmed" });
    expect(settings()).toEqual({
      lang: "en",
      timezone: "Europe/Berlin",
      digest_size: 10,
      mail_format: "text",
      confirmed: 1,
    });
  });

  it("answers exactly as it does for a new address", async () => {
    const forConfirmed = await subscribe(env, EMAIL, "en");
    const forNew = await subscribe(env, "new@aidr-test.dev", "en");
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
      "text"
    );
    expect(
      sqlite
        .prepare(
          "SELECT lang, timezone, digest_size, mail_format, confirmed FROM subscribers WHERE email = ?"
        )
        .get("new@aidr-test.dev")
    ).toEqual({
      lang: "en",
      timezone: "Europe/Berlin",
      digest_size: 3,
      mail_format: "text",
      confirmed: 0,
    });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(settingsChangeFromParams(lastConfirmLink().searchParams)).toBe(
      undefined
    );
  });
});
