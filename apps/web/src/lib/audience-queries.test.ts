import { beforeEach, describe, expect, it } from "vitest";
import {
  GA4_STALE_AFTER_SECONDS,
  loadAudienceStats,
  resetAudienceProbes,
} from "./audience-queries";
import type { DbReader } from "./db";
import type { DayCount, NamedCount } from "./system-queries";

/**
 * D1 stand-in keyed on statement text. `unsupported` names the tables/columns
 * this environment has not applied so the probe path is exercised the way a
 * real un-migrated database behaves — including `batch()` aborting wholesale
 * on one failing statement, which is the hazard the probes exist to avoid.
 */
interface FakeDbOptions {
  unsupported?: string[];
  ga4Row?: { property_id: string; fetched_at: number; payload: string } | null;
  confirmed?: number;
  total?: number;
  new7d?: number;
  new28d?: number;
  byLang?: NamedCount[];
  bySource?: NamedCount[];
  byDigestSize?: { size: number; count: number }[];
  newPerDay?: DayCount[];
}

function fakeDb(options: FakeDbOptions): DbReader {
  const unsupported = options.unsupported ?? [];

  const guard = (sql: string): void => {
    if (unsupported.some((needle) => sql.includes(needle))) {
      throw new Error(`no such table: ${sql.slice(0, 60)}`);
    }
  };

  const resultFor = (sql: string): { results: unknown[] } => {
    guard(sql);
    // Most specific first: every breakdown query also matches the count
    // predicates below, so ordering decides which fake row it sees.
    if (/lang AS name/.test(sql)) return { results: options.byLang ?? [] };
    if (/subscriber_sources/.test(sql))
      return { results: options.bySource ?? [] };
    if (/digest_size/.test(sql)) return { results: options.byDigestSize ?? [] };
    if (/GROUP BY date/.test(sql)) return { results: options.newPerDay ?? [] };
    if (/-7 days/.test(sql)) return { results: [{ c: options.new7d ?? 0 }] };
    if (/-28 days/.test(sql)) return { results: [{ c: options.new28d ?? 0 }] };
    if (/WHERE confirmed = 1/.test(sql)) {
      return { results: [{ c: options.confirmed ?? 0 }] };
    }
    if (/COUNT\(\*\) AS c FROM subscribers\s*$/i.test(sql)) {
      return { results: [{ c: options.total ?? 0 }] };
    }
    return { results: [] };
  };

  const prepare = (sql: string) => {
    const statement = {
      sql,
      bind: () => statement,
      run: async () => {
        guard(sql);
        return { success: true };
      },
      first: async () => {
        guard(sql);
        return /FROM ga4_insights/.test(sql) ? (options.ga4Row ?? null) : null;
      },
      all: async () => {
        guard(sql);
        return { results: [] };
      },
    };
    return statement;
  };

  return {
    prepare,
    batch: async (statements: D1PreparedStatement[]) =>
      statements.map((statement) =>
        resultFor((statement as unknown as { sql: string }).sql)
      ),
  } as unknown as DbReader;
}

const VALID_PAYLOAD = JSON.stringify({
  version: 1,
  propertyId: "123456",
  fetchedAt: 1_757_000_000,
  totals: { views: 420, users: 90, sessions: 150, newUsers: 12 },
  daily: [{ date: "2026-09-01", views: 20, users: 7, sessions: 9 }],
  topPages: [{ name: "https://aidr.today/", views: 300, users: 80 }],
  sources: [{ name: "(direct)", views: 200, users: 60 }],
});

/** Same payload, measured at a different time. Staleness is read from the
 *  snapshot's own `fetchedAt` — that is when GA4 was actually pulled. */
function payloadFetchedAt(fetchedAt: number): string {
  return JSON.stringify({
    version: 1,
    propertyId: "123456",
    fetchedAt,
    totals: { views: 420, users: 90, sessions: 150, newUsers: 12 },
    daily: [{ date: "2026-09-01", views: 20, users: 7, sessions: 9 }],
    topPages: [],
    sources: [],
  });
}

const NOW_SEC = 1_757_100_000;
const now = () => NOW_SEC * 1000;

beforeEach(() => {
  resetAudienceProbes();
});

describe("loadAudienceStats", () => {
  it("reads a stored GA4 snapshot into views, DAU, MAU, and top pages", async () => {
    const db = fakeDb({
      ga4Row: {
        property_id: "123456",
        fetched_at: NOW_SEC - 3600,
        payload: VALID_PAYLOAD,
      },
      confirmed: 120,
      total: 125,
      new7d: 3,
      new28d: 9,
      bySource: [
        { name: "extension", count: 60 },
        { name: "unknown", count: 60 },
      ],
      byLang: [{ name: "vi", count: 100 }],
      byDigestSize: [{ size: 5, count: 110 }],
      newPerDay: [{ date: "2026-09-01", count: 2 }],
    });

    const stats = await loadAudienceStats(db, { now: now() });

    expect(stats.ga4.status).toBe("available");
    expect(stats.ga4.audience?.views28d).toBe(420);
    expect(stats.ga4.audience?.mau).toBe(90);
    expect(stats.ga4.audience?.dau).toBe(7);
    expect(stats.ga4.viewsPerDay).toEqual([{ date: "2026-09-01", count: 20 }]);
    expect(stats.ga4.usersPerDay).toEqual([{ date: "2026-09-01", count: 7 }]);
    expect(stats.ga4.topPages).toEqual([
      { name: "https://aidr.today/", count: 300 },
    ]);
    expect(stats.ga4.sources).toEqual([{ name: "(direct)", count: 200 }]);

    expect(stats.subscribers.confirmed).toBe(120);
    expect(stats.subscribers.unconfirmed).toBe(5);
    expect(stats.subscribers.new7d).toBe(3);
    expect(stats.subscribers.new28d).toBe(9);
    expect(stats.subscribers.bySource).toEqual([
      { name: "extension", count: 60 },
      { name: "unknown", count: 60 },
    ]);
    expect(stats.subscribers.byLang).toEqual([{ name: "vi", count: 100 }]);
    expect(stats.subscribers.byDigestSize).toEqual([{ size: 5, count: 110 }]);
  });

  it("reports unconfigured when migration 0028 has not been applied", async () => {
    const db = fakeDb({ unsupported: ["ga4_insights"], confirmed: 4 });
    const stats = await loadAudienceStats(db, { now: now() });

    expect(stats.ga4.status).toBe("unconfigured");
    expect(stats.ga4.audience).toBeNull();
    // Subscriber counts still answer — one broken source must not blank the tab.
    expect(stats.subscribers.confirmed).toBe(4);
  });

  it("reports unconfigured, never zero, when no sync has ever written a row", async () => {
    const db = fakeDb({ ga4Row: null });
    const stats = await loadAudienceStats(db, { now: now() });

    // An empty table cannot prove "no traffic" — it can only mean "never asked".
    expect(stats.ga4.status).toBe("unconfigured");
    expect(stats.ga4.audience).toBeNull();
  });

  it("reports error when a stored payload no longer validates", async () => {
    const db = fakeDb({
      ga4Row: {
        property_id: "123456",
        fetched_at: NOW_SEC,
        payload: JSON.stringify({ version: 1, totals: { views: 5 } }),
      },
    });
    const stats = await loadAudienceStats(db, { now: now() });

    expect(stats.ga4.status).toBe("error");
    expect(stats.ga4.audience).toBeNull();
    expect(stats.ga4.fetchedAt).toBe(NOW_SEC);
  });

  it("labels an old snapshot stale instead of presenting it as current", async () => {
    const db = fakeDb({
      ga4Row: {
        property_id: "123456",
        fetched_at: NOW_SEC - GA4_STALE_AFTER_SECONDS - 60,
        payload: payloadFetchedAt(NOW_SEC - GA4_STALE_AFTER_SECONDS - 60),
      },
    });
    const stats = await loadAudienceStats(db, { now: now() });

    // Still shown, but never as "today".
    expect(stats.ga4.status).toBe("stale");
    expect(stats.ga4.audience?.mau).toBe(90);
  });

  it("keeps the digest-size query out of the batch when the column is absent", async () => {
    // `digest_size` is added by the mail runtime schema, not by a numbered
    // migration, so a batch containing it would abort every other count.
    const db = fakeDb({ unsupported: ["digest_size"], confirmed: 7 });
    const stats = await loadAudienceStats(db, { now: now() });

    expect(stats.subscribers.confirmed).toBe(7);
    expect(stats.subscribers.byDigestSize).toEqual([]);
  });

  it("keeps the source query out of the batch when subscriber_sources is absent", async () => {
    // digest_size is present and subscriber_sources is not. The two optional
    // queries sit next to each other in the batch, so a positional read of
    // the results would hand the digest-size rows to `bySource` here.
    const db = fakeDb({
      unsupported: ["subscriber_sources"],
      confirmed: 7,
      byDigestSize: [
        { size: 5, count: 6 },
        { size: 8, count: 1 },
      ],
    });
    const stats = await loadAudienceStats(db, { now: now() });

    expect(stats.subscribers.confirmed).toBe(7);
    expect(stats.subscribers.bySource).toEqual([]);
    expect(stats.subscribers.byDigestSize).toEqual([
      { size: 5, count: 6 },
      { size: 8, count: 1 },
    ]);
  });

  it("never reports a negative unconfirmed count", async () => {
    const db = fakeDb({ confirmed: 10, total: 4 });
    const stats = await loadAudienceStats(db, { now: now() });
    expect(stats.subscribers.unconfirmed).toBe(0);
  });
});
