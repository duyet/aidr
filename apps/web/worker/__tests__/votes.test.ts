import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { rankScore } from "../ranking.js";
import {
  applyVote,
  itemVotesTableReady,
  listReaderVotes,
  nextVote,
  resetItemVotesTableProbe,
} from "../votes.js";

const ITEM = "a".repeat(64);
const OTHER = "b".repeat(64);
const NOW = Date.UTC(2026, 9, 4, 12);

function d1(db: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          args = values;
          return stmt;
        },
        async first<T>() {
          return (
            (db.prepare(sql).get(...(args as never[])) as T | undefined) ?? null
          );
        },
        async all<T>() {
          return { results: db.prepare(sql).all(...(args as never[])) as T[] };
        },
        async run() {
          db.prepare(sql).run(...(args as never[]));
          return { success: true };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

function seed() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE items (
      id TEXT PRIMARY KEY, status TEXT, published_at INTEGER,
      llm_importance REAL, llm_quality REAL, rank_score REAL,
      source_id TEXT, points INTEGER, comments INTEGER, url TEXT,
      duplicate_of TEXT);
    CREATE TABLE item_votes (
      item_id TEXT NOT NULL, user_id TEXT NOT NULL,
      value INTEGER NOT NULL CHECK (value IN (1, -1)),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (item_id, user_id))`);
  const add = db.prepare(
    `INSERT INTO items VALUES (?, 'published', ?, 8, 8, 1, 'hn', 10, 0, ?, NULL)`
  );
  const published = Math.floor(NOW / 1000) - 3600;
  add.run(ITEM, published, "https://example.com/a");
  add.run(OTHER, published, "https://example.com/b");
  return { db, published };
}

function stored(db: DatabaseSync, id: string) {
  return db.prepare("SELECT rank_score FROM items WHERE id = ?").get(id) as {
    rank_score: number;
  };
}

function expected(published: number, voteNet: number) {
  return rankScore({
    importance: 8,
    quality: 8,
    points: 10,
    comments: 0,
    voteNet,
    sourceCount: 1,
    publishedAt: published * 1000,
    now: NOW,
  });
}

describe("itemVotesTableReady", () => {
  it("returns false on a thrown probe and true once the next probe succeeds", async () => {
    resetItemVotesTableProbe();
    let calls = 0;
    const db = {
      prepare() {
        return {
          async all() {
            calls += 1;
            if (calls === 1) throw new Error("d1 unavailable");
            return { results: [] };
          },
        };
      },
    };
    expect(await itemVotesTableReady(db)).toBe(false);
    expect(await itemVotesTableReady(db)).toBe(true);
    expect(calls).toBe(2);
  });

  it("keeps a successful probe and does not probe again", async () => {
    resetItemVotesTableProbe();
    let calls = 0;
    const ok = {
      prepare() {
        return {
          async all() {
            calls += 1;
            return { results: [] };
          },
        };
      },
    };
    expect(await itemVotesTableReady(ok)).toBe(true);

    const failing = {
      prepare() {
        return {
          async all() {
            calls += 1;
            throw new Error("should not run");
          },
        };
      },
    };
    expect(await itemVotesTableReady(failing)).toBe(true);
    expect(calls).toBe(1);
  });
});

describe("nextVote", () => {
  it("clears the same button and replaces the other one", () => {
    expect(nextVote(null, 1)).toBe(1);
    expect(nextVote(1, 1)).toBeNull();
    expect(nextVote(1, -1)).toBe(-1);
    expect(nextVote(-1, -1)).toBeNull();
    expect(nextVote(-1, 1)).toBe(1);
  });
});

describe("applyVote", () => {
  it("keeps one row per user, and each save recomputes rank_score", async () => {
    const { db, published } = seed();
    const database = d1(db);
    const up = await applyVote(database, {
      itemId: ITEM,
      userId: "user_a",
      value: 1,
      nowMs: NOW,
    });
    expect(up).toMatchObject({ ok: true, myVote: 1, voteNet: 1 });
    expect(stored(db, ITEM).rank_score).toBeCloseTo(expected(published, 1), 6);
    expect(stored(db, ITEM).rank_score).toBeGreaterThan(expected(published, 0));

    // The same button again clears the vote and puts the score back.
    const cleared = await applyVote(database, {
      itemId: ITEM,
      userId: "user_a",
      value: 1,
      nowMs: NOW,
    });
    expect(cleared).toMatchObject({ ok: true, myVote: 0, voteNet: 0 });
    expect(stored(db, ITEM).rank_score).toBeCloseTo(expected(published, 0), 6);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM item_votes").get() as { n: number }
    ).toEqual({ n: 0 });

    // Switching replaces the row. It does not add a second vote.
    await applyVote(database, {
      itemId: ITEM,
      userId: "user_a",
      value: 1,
      nowMs: NOW,
    });
    const down = await applyVote(database, {
      itemId: ITEM,
      userId: "user_a",
      value: -1,
      nowMs: NOW,
    });
    expect(down).toMatchObject({ ok: true, myVote: -1, voteNet: -1 });
    expect(stored(db, ITEM).rank_score).toBeCloseTo(expected(published, -1), 6);
    expect(stored(db, ITEM).rank_score).toBeLessThan(expected(published, 0));
    expect(
      db.prepare("SELECT value FROM item_votes WHERE user_id = 'user_a'").all()
    ).toEqual([{ value: -1 }]);

    // A second reader is a separate row. The net is the sum.
    const other = await applyVote(database, {
      itemId: ITEM,
      userId: "user_b",
      value: 1,
      nowMs: NOW,
    });
    expect(other).toMatchObject({ ok: true, myVote: 1, voteNet: 0 });
    expect(stored(db, ITEM).rank_score).toBeCloseTo(expected(published, 0), 6);
    expect(stored(db, OTHER).rank_score).toBe(1);

    const listed = await listReaderVotes(database, "user_a", [ITEM, OTHER]);
    expect(listed.votes).toEqual({ [ITEM]: -1 });
    expect(listed.nets[ITEM]).toBe(0);
    expect(listed.nets[OTHER]).toBeUndefined();
  });

  it("does not store a vote on a story that is not published", async () => {
    const { db } = seed();
    db.prepare("UPDATE items SET status = 'rejected' WHERE id = ?").run(ITEM);
    const result = await applyVote(d1(db), {
      itemId: ITEM,
      userId: "user_a",
      value: 1,
      nowMs: NOW,
    });
    expect(result).toEqual({ ok: false, error: "Story not found" });
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM item_votes").get() as { n: number }
    ).toEqual({ n: 0 });
  });
});
