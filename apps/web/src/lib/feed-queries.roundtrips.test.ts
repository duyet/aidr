import { describe, expect, it } from "vitest";
import type { DbReader } from "./db";
import { getFeed } from "./feed-queries";

/** Counts D1 round trips the way the Worker pays for them from a far colo:
 * every `all()`/`first()`/`run()`/`batch()` is one network round trip, and
 * trips that overlap in flight cost one latency, so `waves` is the number
 * of sequential latencies a request waits on. */
function tracingDb() {
  let inFlight = 0;
  let waves = 0;
  let trips = 0;
  const writes: string[] = [];
  const trip = <T>(sqls: string[], result: T): Promise<T> => {
    trips += 1;
    if (inFlight === 0) waves += 1;
    inFlight += 1;
    for (const sql of sqls) {
      if (/^\s*(CREATE|UPDATE|INSERT|DELETE|ALTER)\b/i.test(sql)) {
        writes.push(sql.trim().split("\n")[0]);
      }
    }
    return new Promise((resolve) =>
      setTimeout(() => {
        inFlight -= 1;
        resolve(result);
      }, 0)
    );
  };
  const db = {
    prepare(sql: string) {
      const stmt = {
        sql,
        bind: () => stmt,
        all: () => trip([sql], { results: [] }),
        first: () => trip([sql], null),
        run: () => trip([sql], { success: true }),
      };
      return stmt;
    },
    batch: (stmts: { sql: string }[]) =>
      trip(
        stmts.map((s) => s.sql),
        stmts.map(() => ({ results: [] }))
      ),
  };
  return {
    db: db as unknown as DbReader,
    stats: () => ({ waves, trips, writes }),
  };
}

describe("homepage feed D1 round trips", () => {
  it("a cold isolate sends one batch, waits on one latency and writes nothing", async () => {
    // The first call in this file is the cold isolate. The deploy gate
    // guarantees the schema, so no per-isolate probe may run before the
    // batch: each one costs a full primary round trip from a far colo.
    const { db, stats } = tracingDb();
    await getFeed(db, { days: 3, readOrder: true, detail: false });
    expect(stats()).toEqual({ waves: 1, trips: 1, writes: [] });
  });

  it("a warm isolate sends the same single batch", async () => {
    const { db, stats } = tracingDb();
    await getFeed(db, { days: 3, readOrder: true, detail: false });
    expect(stats()).toEqual({ waves: 1, trips: 1, writes: [] });
  });

  it("the full feed (sources included) still waits on one latency", async () => {
    const { db, stats } = tracingDb();
    await getFeed(db, { days: 3 });
    expect(stats()).toEqual({ waves: 1, trips: 1, writes: [] });
  });
});
