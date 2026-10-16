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
  sqlite.exec(`CREATE TABLE items (
    id TEXT PRIMARY KEY, category TEXT, title TEXT,
    status TEXT NOT NULL DEFAULT 'published', duplicate_of TEXT)`);
  return sqlite;
}

describe("loadSystemReads", () => {
  it("sums reads per category, channel and kind over 28 days (defect: a category double-counts or old reads leak in)", async () => {
    const sqlite = itemsOnly();
    sqlite.exec(MIGRATION);
    sqlite.exec(`INSERT INTO items (id, category) VALUES
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
      top_stories: [
        {
          channel: "web",
          stories: [{ id: "a", title: null, opens: 5, outbound: 0 }],
        },
      ],
    });
  });

  it("fails loud on a query error", async () => {
    const broken = {
      prepare: () => ({ bind: () => ({}) }),
      batch: async () => {
        throw new Error("D1_ERROR: network connection lost");
      },
    } as unknown as DbReader;
    await expect(loadSystemReads(broken)).rejects.toThrow("network");
  });
});

describe("top stories by channel", () => {
  function top(setup: string) {
    const sqlite = itemsOnly();
    sqlite.exec(MIGRATION);
    sqlite.exec(setup);
    return loadSystemReads(d1(sqlite)).then((r) => r.top_stories);
  }

  it("hides stories under the minimum opens (defect: a 1-2 reader story is listed)", async () => {
    const tops = await top(`
      INSERT INTO items (id, title) VALUES ('a', 'Three'), ('b', 'Two');
      INSERT INTO item_reads VALUES
        ('a', date('now'), 'web', 'open', 3),
        ('a', date('now'), 'web', 'outbound', 1),
        ('b', date('now'), 'web', 'open', 2),
        ('b', date('now'), 'web', 'outbound', 2)`);
    expect(tops).toEqual([
      {
        channel: "web",
        stories: [{ id: "a", title: "Three", opens: 3, outbound: 1 }],
      },
    ]);
  });

  it("counts only the last 7 days (defect: the 28-day window leaks in)", async () => {
    const tops = await top(`
      INSERT INTO items (id, title) VALUES ('a', 'Old'), ('b', 'Fresh');
      INSERT INTO item_reads VALUES
        ('a', date('now', '-7 days'), 'web', 'open', 50),
        ('b', date('now', '-6 days'), 'web', 'open', 3)`);
    expect(tops).toEqual([
      {
        channel: "web",
        stories: [{ id: "b", title: "Fresh", opens: 3, outbound: 0 }],
      },
    ]);
  });

  it("folds a merged id into its canonical (defect: the title is joined from the merged duplicate)", async () => {
    const tops = await top(`
      INSERT INTO items (id, title, status, duplicate_of) VALUES
        ('c', 'Canonical', 'published', NULL),
        ('m', 'Dup', 'merged', 'c');
      INSERT INTO item_reads VALUES
        ('c', date('now'), 'web', 'open', 2),
        ('m', date('now'), 'web', 'open', 2),
        ('m', date('now'), 'web', 'outbound', 1)`);
    expect(tops).toEqual([
      {
        channel: "web",
        stories: [{ id: "c", title: "Canonical", opens: 4, outbound: 1 }],
      },
    ]);
  });

  it("keeps the top 5 per channel, ordered by opens (defect: a global limit starves small channels)", async () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const tops = await top(`
      INSERT INTO items (id, title) VALUES ${ids.map((i) => `('${i}', '${i}')`).join(",")};
      INSERT INTO item_reads VALUES
        ${ids.map((i, n) => `('${i}', date('now'), 'web', 'open', ${10 - n})`).join(",")},
        ('a', date('now'), 'facebook', 'open', 3)`);
    expect(tops.map((c) => [c.channel, c.stories.map((s) => s.id)])).toEqual([
      ["web", ["a", "b", "c", "d", "e"]],
      ["facebook", ["a"]],
    ]);
  });

  it("holds email to 10 opens while web shows at 3 (defect: one flat minimum lets one email reader open a story 3 times and appear)", async () => {
    const tops = await top(`
      INSERT INTO items (id, title) VALUES ('a', 'A');
      INSERT INTO item_reads VALUES
        ('a', date('now'), 'email', 'open', 5),
        ('a', date('now'), 'web', 'open', 5),
        ('a', date('now'), 'telegram', 'open', 9),
        ('a', date('now'), 'extension', 'open', 9),
        ('a', date('now'), 'facebook', 'open', 3)`);
    expect(tops.map((c) => c.channel).sort()).toEqual(["facebook", "web"]);
    const atTen = await top(`
      INSERT INTO items (id, title) VALUES ('a', 'A');
      INSERT INTO item_reads VALUES
        ('a', date('now'), 'email', 'open', 10),
        ('a', date('now'), 'telegram', 'open', 10),
        ('a', date('now'), 'extension', 'open', 10)`);
    expect(atTen.map((c) => c.channel).sort()).toEqual([
      "email",
      "extension",
      "telegram",
    ]);
  });

  it("lists only published canonicals (defect: a draft, an unpublished item or a merged id with an unpublished canonical is listed)", async () => {
    const tops = await top(`
      INSERT INTO items (id, title, status, duplicate_of) VALUES
        ('pub', 'Published', 'published', NULL),
        ('draft', 'Draft', 'draft', NULL),
        ('hidden', 'Hidden', 'unpublished', NULL),
        ('canon-draft', 'Canon draft', 'draft', NULL),
        ('m-draft', 'Merged into draft', 'merged', 'canon-draft'),
        ('m-gone', 'Merged into nothing', 'merged', 'missing');
      INSERT INTO item_reads VALUES
        ('pub', date('now'), 'web', 'open', 3),
        ('draft', date('now'), 'web', 'open', 9),
        ('hidden', date('now'), 'web', 'open', 9),
        ('m-draft', date('now'), 'web', 'open', 9),
        ('m-gone', date('now'), 'web', 'open', 9)`);
    expect(tops).toEqual([
      {
        channel: "web",
        stories: [{ id: "pub", title: "Published", opens: 3, outbound: 0 }],
      },
    ]);
  });
});
