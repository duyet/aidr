import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  decideRead,
  isBotUserAgent,
  parseReadBeacon,
  READ_COUNT_COLUMN,
  READ_COUNT_JOIN_I,
  READ_ROW_CAP,
  READER_READ_HALF,
  READER_READ_MAX_BOOST,
  readFactor,
  recordRead,
} from "../reads.js";

const ITEM = "a".repeat(64);
const MERGED = "b".repeat(64);
const MISSING = "c".repeat(64);
const OTHER = "d".repeat(64);
const IP = "198.51.100.7";
const DAY = "2026-10-16";
const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const MIGRATION = readFileSync(
  new URL("../../migrations/0065_item_reads.sql", import.meta.url),
  "utf8"
);

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
          const { changes } = db.prepare(sql).run(...(args as never[]));
          return { success: true, meta: { changes: Number(changes) } };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

function seed() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(
    "CREATE TABLE items (id TEXT PRIMARY KEY, status TEXT, duplicate_of TEXT)"
  );
  raw.exec(MIGRATION);
  raw.prepare("INSERT INTO items VALUES (?, 'published', NULL)").run(ITEM);
  raw.prepare("INSERT INTO items VALUES (?, 'merged', NULL)").run(MERGED);
  return { raw, db: d1(raw) };
}

function readRows(raw: DatabaseSync) {
  return raw
    .prepare("SELECT item_id, day, channel, kind, count FROM item_reads")
    .all();
}

const beacon = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ item_id: ITEM, kind: "open", channel: "web", ...overrides });

/** The binding's contract: `limit` calls a minute per key, per location. */
function fakeLimiter(limit = 1): RateLimit & { keys: string[] } {
  const seen = new Map<string, number>();
  const keys: string[] = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return { success: n <= limit };
    },
  };
}

const decide = (
  db: D1Database,
  input: Partial<Parameters<typeof decideRead>[0]> = {}
) =>
  decideRead({
    ua: BROWSER,
    fetchSite: "same-origin",
    ip: IP,
    limiter: undefined,
    body: beacon(),
    day: DAY,
    db,
    ...input,
  });

describe("POST /api/read decision", () => {
  it.each([
    ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1)"],
    ["Facebook preview", "facebookexternalhit/1.1"],
    ["headless Chrome", "Mozilla/5.0 HeadlessChrome/130.0"],
    ["empty", ""],
    ["missing", null],
  ])(
    "the %s user agent is answered 204 and writes no row (defect: crawlers inflate reads)",
    async (_, ua) => {
      const { raw, db } = seed();
      expect(await decide(db, { ua })).toBe(204);
      expect(readRows(raw)).toEqual([]);
    }
  );

  it("a browser beacon counts one open for that story, day and channel", async () => {
    const { raw, db } = seed();
    const status = await decide(db, { body: beacon({ channel: "telegram" }) });
    expect(status).toBe(204);
    expect(readRows(raw)).toEqual([
      { item_id: ITEM, day: DAY, channel: "telegram", kind: "open", count: 1 },
    ]);
  });

  it("a beacon fired from another site writes no row (defect: any page can inflate a story)", async () => {
    const { raw, db } = seed();
    expect(await decide(db, { fetchSite: "cross-site" })).toBe(204);
    expect(readRows(raw)).toEqual([]);
  });

  it("a body that is not JSON or not a beacon is a 400 and writes nothing", async () => {
    const { raw, db } = seed();
    for (const body of ["not json", "null", beacon({ kind: "scroll" })]) {
      expect(await decide(db, { fetchSite: null, body })).toBe(400);
    }
    expect(readRows(raw)).toEqual([]);
  });

  it("an id that is not a published story is a 404 and writes nothing", async () => {
    const { raw, db } = seed();
    expect(await decide(db, { body: beacon({ item_id: MISSING }) })).toBe(404);
    expect(readRows(raw)).toEqual([]);
  });

  it("99 beacons from one IP for one story count once (defect: a script maxes a story's reads)", async () => {
    const { raw, db } = seed();
    const limiter = fakeLimiter();
    for (let i = 0; i < 99; i++) {
      expect(await decide(db, { limiter })).toBe(204);
    }
    expect(readRows(raw)).toEqual([
      { item_id: ITEM, day: DAY, channel: "web", kind: "open", count: 1 },
    ]);
  });

  it("the limit is per story and kind, so a reader's next story still counts (defect: the key drops the item)", async () => {
    const raw = seed().raw;
    raw.prepare("INSERT INTO items VALUES (?, 'published', NULL)").run(OTHER);
    const db = d1(raw);
    const limiter = fakeLimiter();
    await decide(db, { limiter });
    await decide(db, { limiter, body: beacon({ kind: "outbound" }) });
    await decide(db, { limiter, body: beacon({ item_id: OTHER }) });
    await decide(db, { limiter, ip: "203.0.113.9" });
    expect(
      raw
        .prepare(
          "SELECT item_id, kind, SUM(count) AS n FROM item_reads GROUP BY 1, 2 ORDER BY 1, 2"
        )
        .all()
    ).toEqual([
      { item_id: ITEM, kind: "open", n: 2 },
      { item_id: ITEM, kind: "outbound", n: 1 },
      { item_id: OTHER, kind: "open", n: 1 },
    ]);
  });

  it("with the limiter bound, a request with no client IP writes nothing (defect: a missing header bypasses the limit)", async () => {
    const { raw, db } = seed();
    const limiter = fakeLimiter();
    expect(await decide(db, { limiter, ip: null })).toBe(204);
    expect(readRows(raw)).toEqual([]);
    expect(limiter.keys).toEqual([]);
  });
});

describe("recordRead", () => {
  it("counts nothing for an unknown or merged id (defect: reads pile onto ids the feed never shows)", async () => {
    const { raw, db } = seed();
    for (const itemId of [MISSING, MERGED]) {
      expect(
        await recordRead(db, { itemId, kind: "open", channel: "web" }, DAY)
      ).toBe("unknown_item");
    }
    expect(raw.prepare("SELECT COUNT(*) AS n FROM item_reads").get()).toEqual({
      n: 0,
    });
  });

  it("stops at READ_ROW_CAP and reports capped (defect: one script inflates a row without bound)", async () => {
    const { raw, db } = seed();
    const read = { itemId: ITEM, kind: "outbound", channel: "web" } as const;
    for (let i = 0; i < READ_ROW_CAP; i++) {
      expect(await recordRead(db, read, DAY)).toBe("counted");
    }
    expect(await recordRead(db, read, DAY)).toBe("capped");
    expect(readRows(raw)).toEqual([
      {
        item_id: ITEM,
        day: DAY,
        channel: "web",
        kind: "outbound",
        count: READ_ROW_CAP,
      },
    ]);
    expect(
      await recordRead(db, { ...read, kind: "open" }, DAY),
      "the cap is per row, not per story"
    ).toBe("counted");
  });
});

describe("parseReadBeacon", () => {
  it("accepts a story id, a known kind and a known channel", () => {
    expect(
      parseReadBeacon({ item_id: ITEM, kind: "outbound", channel: "email" })
    ).toEqual({ itemId: ITEM, kind: "outbound", channel: "email" });
  });

  it.each([
    ["a bad kind", { item_id: ITEM, kind: "hover", channel: "web" }],
    ["a bad channel", { item_id: ITEM, kind: "open", channel: "twitter" }],
    ["a non-hex id", { item_id: "not-a-story", kind: "open", channel: "web" }],
    ["a numeric id", { item_id: 123, kind: "open", channel: "web" }],
    ["null", null],
  ])("rejects %s (defect: free text reaches the table)", (_, raw) => {
    expect(parseReadBeacon(raw)).toBeNull();
  });
});

describe("isBotUserAgent", () => {
  it("lets a desktop browser through", () => {
    expect(isBotUserAgent(BROWSER)).toBe(false);
  });

  it.each(["curl/8.4.0", "python-requests/2.31", "Lighthouse", "Slurp"])(
    "flags %s",
    (ua) => {
      expect(isBotUserAgent(ua)).toBe(true);
    }
  );
});

describe("readFactor", () => {
  it("is exactly 1 with no reads (defect: a new story is penalised or boosted)", () => {
    expect(readFactor(0)).toBe(1);
    expect(readFactor(undefined)).toBe(1);
    expect(readFactor(Number.NaN)).toBe(1);
  });

  it("starts flat, so the one or two counts one client gets past the limiter barely move a story (defect: a steep start lets one IP jump the feed)", () => {
    expect(readFactor(2)).toBeLessThan(1.005);
    expect(readFactor(50)).toBeGreaterThan(1.05);
  });

  it("never reaches 1 + READER_READ_MAX_BOOST, so reads cannot pass a story stored 1.3x higher", () => {
    expect(readFactor(1e9)).toBeLessThan(1 + READER_READ_MAX_BOOST);
    expect(readFactor(READER_READ_HALF)).toBeCloseTo(
      1 + READER_READ_MAX_BOOST / 2
    );
  });
});

describe("READ_COUNT_JOIN_I", () => {
  function readCount(raw: DatabaseSync, id: string) {
    return (
      raw
        .prepare(
          `SELECT ${READ_COUNT_COLUMN} FROM items i ${READ_COUNT_JOIN_I} WHERE i.id = ?`
        )
        .get(id) as { read_count: number }
    ).read_count;
  }

  it("counts today and yesterday UTC only (defect: old reads keep lifting a story)", () => {
    const { raw } = seed();
    raw.exec(`INSERT INTO item_reads VALUES
        ('${ITEM}', date('now'), 'web', 'open', 7),
        ('${ITEM}', date('now'), 'telegram', 'outbound', 2),
        ('${ITEM}', date('now', '-1 day'), 'web', 'open', 5),
        ('${ITEM}', date('now', '-3 days'), 'web', 'open', 1000)`);
    expect(readCount(raw, ITEM)).toBe(14);
  });

  it("folds reads on an id that was later merged into its canonical (defect: a merge drops the reads)", () => {
    const { raw } = seed();
    raw.exec(`UPDATE items SET duplicate_of = '${ITEM}' WHERE id = '${MERGED}';
      INSERT INTO item_reads VALUES
        ('${ITEM}', date('now'), 'web', 'open', 3),
        ('${MERGED}', date('now'), 'email', 'open', 4)`);
    expect(readCount(raw, ITEM)).toBe(7);
  });
});
