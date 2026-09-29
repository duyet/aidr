import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  GA4_SNAPSHOT_ID,
  GA4_SYNC_INTERVAL_MS,
  maybeSyncGa4Insights,
  normalizeGa4PropertyId,
  resetGa4TableProbe,
  syncGa4Insights,
} from "../ga4/insights.js";
import { parseGa4Snapshot } from "../ga4/snapshot.js";

/** Minimal D1 stand-in: `prepare` returns an object with the statement text,
 *  the bound args, and the `run`/`first`/`all` methods the module calls. */
function fakeDb(options: {
  rows?: Record<string, unknown>[];
  missingTable?: boolean;
  onPrepare?: (sql: string) => void;
}) {
  const written: { sql: string; args: unknown[] }[] = [];
  const missing = (sql: string): boolean =>
    options.missingTable === true && /ga4_insights/.test(sql);
  const prepare = (sql: string) => {
    options.onPrepare?.(sql);
    const guard = () => {
      if (missing(sql)) throw new Error(`no such table: ga4_insights`);
    };
    return {
      bind: (...args: unknown[]) => ({
        sql,
        args,
        run: async () => {
          guard();
          written.push({ sql, args });
          return { success: true };
        },
        first: async <T>() => {
          guard();
          return (
            ((options.rows ?? []).find((row) => matches(row, sql)) as T) ?? null
          );
        },
        all: async <T>() => {
          guard();
          return { results: (options.rows ?? []) as T[] };
        },
      }),
      run: async () => {
        guard();
        written.push({ sql, args: [] });
        return { success: true };
      },
      first: async <T>() => {
        guard();
        return (
          ((options.rows ?? []).find((row) => matches(row, sql)) as T) ?? null
        );
      },
      all: async <T>() => {
        guard();
        return { results: (options.rows ?? []) as T[] };
      },
    };
  };
  const db = { prepare } as unknown as Pick<D1Database, "prepare">;
  return { db, written };
}

function matches(row: Record<string, unknown>, sql: string): boolean {
  if (/FROM ga4_insights/.test(sql)) return row.id === GA4_SNAPSHOT_ID;
  return false;
}

const VALID_ACCOUNT = {
  type: "service_account",
  client_email: "reader@gcp-project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
};

/**
 * A real (throwaway) RSA key: the sync genuinely signs an assertion before it
 * talks to GA4, so a syntactically-plausible fake key would fail in
 * `importKey` and every report assertion below would be untested.
 */
let serviceAccountJson = "";

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  );
  const der = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey)
  );
  let binary = "";
  for (const byte of der) binary += String.fromCharCode(byte);
  serviceAccountJson = JSON.stringify({
    ...VALID_ACCOUNT,
    private_key: `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----\n`,
  });
});

/** A fetcher that answers the token exchange and then the four reports. */
function ga4Fetcher(
  options: {
    totalsRows?: unknown[];
    dailyRows?: unknown[];
    pageRows?: unknown[];
    sourceRows?: unknown[];
    onReport?: (body: string) => void;
  } = {}
) {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "test-token" });
    }
    const body = String(init?.body ?? "{}");
    options.onReport?.(body);
    const parsed = JSON.parse(body) as { dimensions?: { name: string }[] };
    const dimension = parsed.dimensions?.[0]?.name;
    const rows =
      dimension === "date"
        ? (options.dailyRows ?? [])
        : dimension === "pagePath"
          ? (options.pageRows ?? [])
          : dimension === "sessionSource"
            ? (options.sourceRows ?? [])
            : (options.totalsRows ?? []);
    return Response.json({ dimensionHeaders: [], metricHeaders: [], rows });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

const NOW_MS = Date.UTC(2026, 8, 29, 12, 0, 0);

// The table probe is cached per isolate, exactly as it is in the Worker.
beforeEach(() => {
  resetGa4TableProbe();
});

describe("normalizeGa4PropertyId", () => {
  it("accepts the bare id and the properties/ form", () => {
    expect(normalizeGa4PropertyId("123456")).toBe("123456");
    expect(normalizeGa4PropertyId("  properties/123456 ")).toBe("123456");
  });

  it("rejects anything that is not a numeric property id", () => {
    expect(normalizeGa4PropertyId(undefined)).toBeNull();
    expect(normalizeGa4PropertyId("")).toBeNull();
    expect(normalizeGa4PropertyId("properties/")).toBeNull();
    expect(normalizeGa4PropertyId("aidr.today")).toBeNull();
    expect(normalizeGa4PropertyId("123456; DROP TABLE items")).toBeNull();
  });
});

describe("syncGa4Insights", () => {
  it("writes one snapshot row with the parsed daily series and totals", async () => {
    const { db, written } = fakeDb({});
    const { fetcher } = ga4Fetcher({
      totalsRows: [
        {
          metricValues: [
            { value: "420" },
            { value: "90" },
            { value: "150" },
            { value: "12" },
          ],
        },
      ],
      dailyRows: [
        {
          dimensionValues: [{ value: "20260902" }],
          metricValues: [{ value: "10" }, { value: "4" }, { value: "6" }],
        },
        {
          dimensionValues: [{ value: "20260901" }],
          metricValues: [{ value: "20" }, { value: "7" }, { value: "9" }],
        },
      ],
      pageRows: [
        {
          dimensionValues: [{ value: "https://aidr.today/" }],
          metricValues: [{ value: "300" }, { value: "80" }],
        },
        {
          dimensionValues: [{ value: "/news" }],
          metricValues: [{ value: "120" }, { value: "40" }],
        },
      ],
      sourceRows: [
        {
          dimensionValues: [{ value: "(direct)" }],
          metricValues: [{ value: "200" }, { value: "60" }],
        },
      ],
    });

    const result = await syncGa4Insights(
      {
        DB: db,
        GA4_PROPERTY_ID: "123456",
        GA4_SERVICE_ACCOUNT_JSON: serviceAccountJson,
      },
      { now: NOW_MS, fetcher }
    );

    expect(result.status).toBe("ok");
    expect(written).toHaveLength(1);
    const [row] = written;
    expect(row?.args[0]).toBe(GA4_SNAPSHOT_ID);
    expect(row?.args[1]).toBe("123456");
    expect(row?.args[2]).toBe(Math.floor(NOW_MS / 1000));

    const snapshot = parseGa4Snapshot(row?.args[3]);
    expect(snapshot?.totals).toEqual({
      views: 420,
      users: 90,
      sessions: 150,
      newUsers: 12,
    });
    // Rows are stored date-ascending regardless of the order GA4 answered in.
    expect(snapshot?.daily.map((d) => d.date)).toEqual([
      "2026-09-01",
      "2026-09-02",
    ]);
    // Top pages keep GA4's pagePath verbatim; the label strips the origin.
    expect(snapshot?.topPages.map((p) => p.name)).toEqual([
      "https://aidr.today/",
      "/news",
    ]);
    expect(snapshot?.sources).toEqual([
      { name: "(direct)", views: 200, users: 60 },
    ]);
  });

  it("reports unconfigured — and writes nothing — without a credential", async () => {
    const { db, written } = fakeDb({});
    const result = await syncGa4Insights(
      { DB: db, GA4_PROPERTY_ID: "123456" },
      { now: NOW_MS }
    );
    expect(result.status).toBe("unconfigured");
    expect(written).toHaveLength(0);
  });

  it("reports unconfigured when migration 0028 has not been applied", async () => {
    // An un-migrated database cannot store the result, so the sync must not
    // spend a Google round-trip discovering that on every alarm.
    const { db, written } = fakeDb({ missingTable: true });
    const { fetcher, calls } = ga4Fetcher({
      totalsRows: [
        {
          metricValues: [
            { value: "1" },
            { value: "1" },
            { value: "1" },
            { value: "0" },
          ],
        },
      ],
    });

    const result = await syncGa4Insights(
      {
        DB: db,
        GA4_PROPERTY_ID: "123456",
        GA4_SERVICE_ACCOUNT_JSON: serviceAccountJson,
      },
      { now: NOW_MS, fetcher }
    );

    expect(result.status).toBe("unconfigured");
    expect(result.reason).toContain("0028");
    expect(calls).toHaveLength(0);
    expect(written).toHaveLength(0);
  });

  it("never writes a zero audience when GA4 returns no totals row", async () => {
    // An empty report is an unanswered question (new property, bad filter,
    // upstream hiccup) — storing zeros would paint "nobody visited" over it.
    const { db, written } = fakeDb({});
    const { fetcher } = ga4Fetcher({ totalsRows: [] });

    const result = await syncGa4Insights(
      {
        DB: db,
        GA4_PROPERTY_ID: "123456",
        GA4_SERVICE_ACCOUNT_JSON: serviceAccountJson,
      },
      { now: NOW_MS, fetcher }
    );

    expect(result.status).toBe("error");
    expect(written).toHaveLength(0);
  });

  it("leaves the previous snapshot alone when a report call fails", async () => {
    const { db, written } = fakeDb({});
    const fetcher = (async (input: RequestInfo | URL) => {
      if (String(input).includes("googleapis.com/token")) {
        return Response.json({ access_token: "test-token" });
      }
      return new Response("nope", { status: 403 });
    }) as unknown as typeof fetch;

    const result = await syncGa4Insights(
      {
        DB: db,
        GA4_PROPERTY_ID: "123456",
        GA4_SERVICE_ACCOUNT_JSON: serviceAccountJson,
      },
      { now: NOW_MS, fetcher }
    );

    expect(result.status).toBe("error");
    expect(result.reason).toContain("403");
    expect(written).toHaveLength(0);
  });

  it("asks GA4 for the series, 28-day totals, pages, and sources", async () => {
    const requests: {
      dimensions: { name: string }[];
      metrics: { name: string }[];
    }[] = [];
    const { db } = fakeDb({});
    const { fetcher, calls } = ga4Fetcher({
      totalsRows: [
        {
          metricValues: [
            { value: "1" },
            { value: "1" },
            { value: "1" },
            { value: "0" },
          ],
        },
      ],
      onReport: (body) => requests.push(JSON.parse(body)),
    });

    await syncGa4Insights(
      {
        DB: db,
        GA4_PROPERTY_ID: "123456",
        GA4_SERVICE_ACCOUNT_JSON: serviceAccountJson,
      },
      { now: NOW_MS, fetcher }
    );

    expect(calls.filter((c) => c.includes("runReport"))).toHaveLength(4);
    const totals = requests.find((r) => r.dimensions.length === 0);
    expect(totals?.metrics.map((m) => m.name)).toEqual([
      "screenPageViews",
      "totalUsers",
      "sessions",
      "newUsers",
    ]);
    // MAU has to come from totalUsers over the window, never a sum of daily
    // activeUsers, so the dimension-less totals report is not optional.
    expect(requests.map((r) => r.dimensions[0]?.name ?? "(none)")).toEqual(
      expect.arrayContaining(["date", "pagePath", "sessionSource"])
    );
  });
});

describe("maybeSyncGa4Insights", () => {
  it("skips when the stored snapshot is younger than the sync interval", async () => {
    const { db, written } = fakeDb({
      rows: [
        { id: GA4_SNAPSHOT_ID, fetched_at: Math.floor(NOW_MS / 1000) - 3600 },
      ],
    });

    const result = await maybeSyncGa4Insights(
      {
        DB: db,
        GA4_PROPERTY_ID: "123456",
        GA4_SERVICE_ACCOUNT_JSON: serviceAccountJson,
      },
      { now: NOW_MS }
    );

    expect(result.status).toBe("skipped");
    expect(written).toHaveLength(0);
  });

  it("syncs once the stored snapshot is older than the interval", async () => {
    const { db } = fakeDb({
      rows: [
        {
          id: GA4_SNAPSHOT_ID,
          fetched_at:
            Math.floor(NOW_MS / 1000) - GA4_SYNC_INTERVAL_MS / 1000 - 60,
        },
      ],
    });
    const { fetcher } = ga4Fetcher({
      totalsRows: [
        {
          metricValues: [
            { value: "5" },
            { value: "2" },
            { value: "3" },
            { value: "1" },
          ],
        },
      ],
    });

    const result = await maybeSyncGa4Insights(
      {
        DB: db,
        GA4_PROPERTY_ID: "123456",
        GA4_SERVICE_ACCOUNT_JSON: serviceAccountJson,
      },
      { now: NOW_MS, fetcher }
    );

    expect(result.status).toBe("ok");
  });

  it("stays silent when GA4 is not configured, so the alarm is a no-op", async () => {
    const { db, written } = fakeDb({});
    const result = await maybeSyncGa4Insights({ DB: db }, { now: NOW_MS });
    expect(result.status).toBe("unconfigured");
    expect(written).toHaveLength(0);
  });
});
