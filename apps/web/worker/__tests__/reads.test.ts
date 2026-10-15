import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  RANK_SIGNAL_COLUMNS,
  RANK_SIGNAL_JOIN,
  type RankSignalRow,
  READER_READ_CAP,
  rankScore,
  readFactor,
  rowRankSignals,
} from "../ranking.js";
import {
  decideRead,
  isBotUserAgent,
  parseReadBeacon,
  READ_ROW_CAP,
  recordRead,
} from "../reads.js";

const ITEM = "a".repeat(64);
const MERGED = "b".repeat(64);
const MISSING = "c".repeat(64);
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
  raw.exec("CREATE TABLE items (id TEXT PRIMARY KEY, status TEXT)");
  raw.exec(MIGRATION);
  raw.prepare("INSERT INTO items VALUES (?, 'published')").run(ITEM);
  raw.prepare("INSERT INTO items VALUES (?, 'merged')").run(MERGED);
  return { raw, db: d1(raw) };
}

function readRows(raw: DatabaseSync) {
  return raw
    .prepare("SELECT item_id, day, channel, kind, count FROM item_reads")
    .all();
}

const beacon = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ item_id: ITEM, kind: "open", channel: "web", ...overrides });

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
      const status = await decideRead({
        ua,
        fetchSite: "same-origin",
        body: beacon(),
        db,
        day: DAY,
      });
      expect(status).toBe(204);
      expect(readRows(raw)).toEqual([]);
    }
  );

  it("a browser beacon counts one open for that story, day and channel", async () => {
    const { raw, db } = seed();
    const status = await decideRead({
      ua: BROWSER,
      fetchSite: "same-origin",
      body: beacon({ channel: "telegram" }),
      db,
      day: DAY,
    });
    expect(status).toBe(204);
    expect(readRows(raw)).toEqual([
      { item_id: ITEM, day: DAY, channel: "telegram", kind: "open", count: 1 },
    ]);
  });

  it("a beacon fired from another site writes no row (defect: any page can inflate a story)", async () => {
    const { raw, db } = seed();
    const status = await decideRead({
      ua: BROWSER,
      fetchSite: "cross-site",
      body: beacon(),
      db,
      day: DAY,
    });
    expect(status).toBe(204);
    expect(readRows(raw)).toEqual([]);
  });

  it("a body that is not JSON or not a beacon is a 400 and writes nothing", async () => {
    const { raw, db } = seed();
    for (const body of ["not json", "null", beacon({ kind: "scroll" })]) {
      expect(
        await decideRead({ ua: BROWSER, fetchSite: null, body, db, day: DAY })
      ).toBe(400);
    }
    expect(readRows(raw)).toEqual([]);
  });

  it("an id that is not a published story is a 404 and writes nothing", async () => {
    const { raw, db } = seed();
    expect(
      await decideRead({
        ua: BROWSER,
        fetchSite: null,
        body: beacon({ item_id: MISSING }),
        db,
        day: DAY,
      })
    ).toBe(404);
    expect(readRows(raw)).toEqual([]);
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

  it("saturates at the cap, so a read storm cannot outrank a far more important story", () => {
    expect(readFactor(1e6)).toBe(READER_READ_CAP);
    const now = Date.UTC(2026, 9, 16, 12);
    const story = {
      quality: 7,
      points: 50,
      comments: 10,
      sourceCount: 2,
      publishedAt: now - 2 * 3600 * 1000,
      now,
    };
    expect(rankScore({ ...story, importance: 5, readCount: 1e9 })).toBeLessThan(
      rankScore({ ...story, importance: 8, readCount: 0 })
    );
  });
});

describe("RANK_SIGNAL_* read window", () => {
  it("counts today and yesterday UTC only (defect: old reads keep lifting a story)", () => {
    const raw = new DatabaseSync(":memory:");
    raw.exec(`CREATE TABLE items (id TEXT PRIMARY KEY, status TEXT,
        source_id TEXT, points INTEGER, comments INTEGER, url TEXT,
        duplicate_of TEXT);
      CREATE TABLE item_votes (item_id TEXT NOT NULL, user_id TEXT NOT NULL,
        value INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY (item_id, user_id));`);
    raw.exec(MIGRATION);
    raw
      .prepare(
        "INSERT INTO items VALUES (?, 'published', 'hn', 1, 0, 'https://example.com/a', NULL)"
      )
      .run(ITEM);
    raw.exec(`INSERT INTO item_reads VALUES
        ('${ITEM}', date('now'), 'web', 'open', 7),
        ('${ITEM}', date('now'), 'telegram', 'outbound', 2),
        ('${ITEM}', date('now', '-1 day'), 'web', 'open', 5),
        ('${ITEM}', date('now', '-3 days'), 'web', 'open', 1000)`);
    const row = raw
      .prepare(
        `SELECT ${RANK_SIGNAL_COLUMNS} FROM items ${RANK_SIGNAL_JOIN} WHERE id = ?`
      )
      .get(ITEM) as unknown as RankSignalRow;
    expect(row.read_count).toBe(14);
    expect(rowRankSignals(row).readCount).toBe(14);
  });
});
