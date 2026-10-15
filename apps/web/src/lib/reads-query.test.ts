import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { DbReader } from "./db";
import { loadSystemReads } from "./reads-query";

const MIGRATION = readFileSync(
  new URL("../../migrations/0065_item_reads.sql", import.meta.url),
  "utf8"
);

function d1(sqlite: DatabaseSync): DbReader {
  const prepare = (sql: string) => {
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
  };
  return {
    prepare,
    batch: async (stmts: { all: () => Promise<unknown> }[]) =>
      Promise.all(stmts.map((s) => s.all())),
  } as unknown as DbReader;
}

function itemsOnly() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE items (id TEXT PRIMARY KEY, category TEXT)");
  return sqlite;
}

describe("loadSystemReads", () => {
  it("sums reads per category, channel and kind over 28 days (defect: a category double-counts or old reads leak in)", async () => {
    const sqlite = itemsOnly();
    sqlite.exec(MIGRATION);
    sqlite.exec(`INSERT INTO items VALUES
        ('a', 'Models'), ('b', 'Models'), ('c', NULL);
      INSERT INTO item_reads VALUES
        ('a', date('now'), 'web', 'open', 5),
        ('a', date('now'), 'telegram', 'outbound', 2),
        ('b', date('now', '-27 days'), 'web', 'open', 3),
        ('c', date('now', '-1 day'), 'email', 'open', 4),
        ('a', date('now', '-28 days'), 'web', 'open', 100)`);
    expect(await loadSystemReads(d1(sqlite))).toEqual({
      window_days: 28,
      total: 14,
      by_category: [
        { name: "Models", reads: 10, items: 2 },
        { name: "Uncategorized", reads: 4, items: 1 },
      ],
      by_channel: [
        { name: "web", reads: 8 },
        { name: "email", reads: 4 },
        { name: "telegram", reads: 2 },
      ],
      by_kind: [
        { name: "open", reads: 12 },
        { name: "outbound", reads: 2 },
      ],
    });
  });

  it("returns the empty shape before migration 0065 is applied (defect: the Algo tab 500s)", async () => {
    expect(await loadSystemReads(d1(itemsOnly()))).toEqual({
      window_days: 28,
      total: 0,
      by_category: [],
      by_channel: [],
      by_kind: [],
    });
  });

  it("still fails loud on any other query error", async () => {
    const broken = {
      prepare: () => ({ bind: () => ({}) }),
      batch: async () => {
        throw new Error("D1_ERROR: network connection lost");
      },
    } as unknown as DbReader;
    await expect(loadSystemReads(broken)).rejects.toThrow("network");
  });
});
