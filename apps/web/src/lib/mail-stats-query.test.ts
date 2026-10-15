import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { DbReader } from "./db";
import { loadSystemMailStats } from "./mail-stats-query";

const MIGRATION = readFileSync(
  new URL("../../migrations/0069_mail_daily_stats.sql", import.meta.url),
  "utf8"
);

function d1(sqlite: DatabaseSync): DbReader {
  return {
    prepare: (sql: string) => {
      let args: unknown[] = [];
      const stmt = {
        bind: (...a: unknown[]) => {
          args = a;
          return stmt;
        },
        all: async () => ({
          results: sqlite.prepare(sql).all(...(args as never[])),
        }),
      };
      return stmt;
    },
  } as unknown as DbReader;
}

describe("loadSystemMailStats", () => {
  it("sums the last 28 days per language (defect: old days leak in)", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(MIGRATION);
    sqlite.exec(`INSERT INTO mail_daily_stats VALUES
      (date('now'), 'en', 5, 1, 2),
      (date('now', '-27 days'), 'en', 3, 0, 0),
      (date('now'), 'vi', 4, 0, 1),
      (date('now', '-28 days'), 'en', 100, 100, 100)`);
    expect(await loadSystemMailStats(d1(sqlite))).toEqual({
      window_days: 28,
      by_lang: [
        { lang: "en", sent: 8, failed: 1, unsubscribed: 2 },
        { lang: "vi", sent: 4, failed: 0, unsubscribed: 1 },
      ],
    });
  });

  it("answers empty before migration 0069", async () => {
    expect(await loadSystemMailStats(d1(new DatabaseSync(":memory:")))).toEqual(
      { window_days: 28, by_lang: [] }
    );
  });
});
