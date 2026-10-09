/**
 * Delivery idempotency, exercised against real SQLite using the shipped
 * `0014_notifications.sql` migration. The point is the PRIMARY KEY: an
 * EN/VI comparison or a retry after an ambiguous timeout must update ONE row,
 * never create a second one.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTrendingQuery,
  digestKey,
  recordDelivery,
} from "../notify/index.js";
import type { Env } from "../types.js";

afterEach(() => vi.unstubAllGlobals());

const migration = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../migrations/0014_notifications.sql"
  ),
  "utf8"
);

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

function toSqliteInput(value: unknown): SqliteInput {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    ArrayBuffer.isView(value)
  ) {
    return value as SqliteInput;
  }
  throw new TypeError("Unsupported SQLite bind value");
}

/** Minimal D1 shim over the real migration SQL. */
class SqliteD1 {
  constructor(readonly db: DatabaseSync) {}

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: SqliteInput[] = [];
    const prepared = {
      bind(...values: unknown[]) {
        args = values.map(toSqliteInput);
        return prepared;
      },
      async run() {
        statement.run(...args);
        return { success: true };
      },
      async first<T>() {
        return (statement.get(...args) as T | undefined) ?? null;
      },
      async all<T>() {
        return { results: statement.all(...args) as T[] };
      },
    };
    return prepared;
  }
}

function store() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration);
  const env = { DB: new SqliteD1(sqlite) as unknown as D1Database } as Env;
  const rows = () =>
    sqlite
      .prepare(
        "SELECT channel, item_id, status, attempts, message_id FROM notifications ORDER BY channel, item_id"
      )
      .all() as Array<{
      channel: string;
      item_id: string;
      status: string;
      attempts: number;
      message_id: string | null;
    }>;
  return { env, rows, sqlite, close: () => sqlite.close() };
}

describe("notifications delivery idempotency", () => {
  it("keeps ONE row per (channel, item_id) across repeated attempts", async () => {
    const s = store();
    try {
      await recordDelivery(s.env, "telegram", "chat", "abcdef12", {
        ok: true,
        messageId: "101",
      });
      // A retry after an ambiguous timeout updates the same row.
      await recordDelivery(s.env, "telegram", "chat", "abcdef12", {
        ok: true,
        messageId: "102",
      });
      const rows = s.rows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.attempts).toBe(2);
      expect(rows[0]?.message_id).toBe("102");
    } finally {
      s.close();
    }
  });

  it("never creates a second row for the same story in two languages", async () => {
    const s = store();
    try {
      // `lang` is not a delivery identity: the EN and VI passes write the
      // SAME (channel, item_id) row.
      await recordDelivery(s.env, "telegram", "chat", "abcdef12", {
        ok: true,
        messageId: "201",
      });
      await recordDelivery(s.env, "telegram", "chat", "abcdef12", {
        ok: true,
        messageId: "202",
      });
      expect(s.rows()).toHaveLength(1);
      expect(s.rows()[0]?.item_id).toBe("abcdef12");
      expect(s.rows()[0]?.attempts).toBe(2);
    } finally {
      s.close();
    }
  });

  it("keys the digest by local date, never by language", async () => {
    const s = store();
    try {
      const viKey = digestKey("2026-08-17");
      await recordDelivery(s.env, "telegram", "chat", viKey, {
        ok: true,
        messageId: "301",
      });
      expect(s.rows()).toHaveLength(1);
      // The same EN/VI comparison reuses the identical key.
      expect(digestKey("2026-08-17")).toBe(viKey);
      expect(viKey).not.toContain("lang");
    } finally {
      s.close();
    }
  });

  it("records a failure then a success on the same row", async () => {
    const s = store();
    try {
      await recordDelivery(s.env, "telegram", "chat", "digest:2026-08-17", {
        ok: false,
        error: "timeout",
      });
      expect(s.rows()[0]?.status).toBe("failed");
      await recordDelivery(s.env, "telegram", "chat", "digest:2026-08-17", {
        ok: true,
        messageId: "401",
      });
      const rows = s.rows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe("sent");
      expect(rows[0]?.attempts).toBe(2);
    } finally {
      s.close();
    }
  });

  it("never picks a story again after an ambiguous send", async () => {
    // A timeout can come after Telegram accepted the post. If the next hourly
    // run picked the story again, the channel would show it twice. A definite
    // failure is the control: nothing was posted, so it must stay retryable.
    const s = store();
    try {
      s.sqlite.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY, url TEXT, title TEXT, summary TEXT,
          image_url TEXT, media_manifest TEXT, category TEXT,
          points INTEGER, comments INTEGER, rank_score REAL,
          llm_importance INTEGER, status TEXT, published_at INTEGER,
          source_id TEXT, source_lang TEXT
        );
        CREATE TABLE translations (
          item_id TEXT, lang TEXT, title TEXT, summary TEXT
        );
      `);
      const now = Date.now();
      const insert = s.sqlite.prepare(
        `INSERT INTO items (id, url, title, points, comments, rank_score,
           llm_importance, status, published_at)
         VALUES (?, ?, 't', 0, 0, 99, 9, 'published', ?)`
      );
      for (const id of ["ambiguous1", "rejected01"]) {
        insert.run(id, `https://example.com/${id}`, Math.floor(now / 1000));
      }
      const pick = async (channel: string) => {
        const { sql, binds } = buildTrendingQuery(channel, now);
        const { results } = await s.env.DB.prepare(sql)
          .bind(...binds)
          .all<{ id: string }>();
        return results.map((row) => row.id).sort();
      };
      expect(await pick("telegram")).toEqual(["ambiguous1", "rejected01"]);

      await recordDelivery(s.env, "telegram", "chat", "ambiguous1", {
        ok: false,
        ambiguous: true,
        error: "no answer from Telegram: The operation timed out.",
      });
      await recordDelivery(s.env, "telegram", "chat", "rejected01", {
        ok: false,
        error: "Bad Request: wrong file identifier",
      });

      expect(s.rows().map((row) => [row.item_id, row.status])).toEqual([
        ["ambiguous1", "ambiguous"],
        ["rejected01", "failed"],
      ]);
      expect(await pick("telegram")).toEqual(["rejected01"]);
      // The other channel never tried, so it still posts the story.
      expect(await pick("telegram-en")).toEqual(["ambiguous1", "rejected01"]);
    } finally {
      s.close();
    }
  });

  it("keeps channels independent", async () => {
    const s = store();
    try {
      await recordDelivery(s.env, "telegram", "chat", "abcdef12", {
        ok: true,
        messageId: "501",
      });
      await recordDelivery(s.env, "webhook", "https://hook", "abcdef12", {
        ok: true,
        messageId: "502",
      });
      expect(s.rows()).toHaveLength(2);
    } finally {
      s.close();
    }
  });
});
