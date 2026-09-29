/**
 * Scheduled GA4 Data API sync into D1.
 *
 * The browser already reports page views to GA4, but the Worker cannot read
 * them back — so the property is pulled server-side and stored as one
 * snapshot row (`ga4_insights`, migration 0028) that the public
 * `/api/system/audience` endpoint serves. The dashboard therefore never calls
 * Google on a page load, and the site keeps working when GA4 is unreachable:
 * the last good snapshot is what gets rendered.
 *
 * The sync is driven by the hourly ingest Durable Object alarm behind a
 * 24-hour gate (`maybeSyncGa4Insights`), because this account cannot spend
 * Worker cron slots, and by the admin `POST /api/admin/ga4-sync` escape
 * hatch. Every failure is a *status*, never a partial write: a report that
 * comes back empty leaves the previous snapshot untouched.
 */

import { toEpochSeconds } from "../time.js";
import {
  ga4DateFromCompact,
  type RunReportRequest,
  runGa4Report,
} from "./report.js";
import {
  fetchGa4AccessToken,
  parseGa4ServiceAccount,
} from "./service-account.js";
import {
  GA4_SERIES_DAYS,
  GA4_TOP_ROWS,
  GA4_TOTALS_DAYS,
  type Ga4DayPoint,
  type Ga4NamedRow,
  type Ga4Snapshot,
  type Ga4Totals,
} from "./snapshot.js";

/** Minimum gap between two syncs. The alarm fires hourly; GA4 does not need
 *  to be polled more often than the daily resolution of the data itself. */
export const GA4_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** The single-row convention: one current snapshot, replaced in place. */
export const GA4_SNAPSHOT_ID = "current";

export const GA4_SNAPSHOT_SQL = `INSERT INTO ga4_insights (
  id, property_id, fetched_at, payload
) VALUES (?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  property_id = excluded.property_id,
  fetched_at = excluded.fetched_at,
  payload = excluded.payload`;

export const GA4_SNAPSHOT_SELECT_SQL = `SELECT property_id, fetched_at, payload
  FROM ga4_insights
  WHERE id = ?`;

export interface Ga4SyncEnv {
  DB?: Pick<D1Database, "prepare">;
  /** Numeric GA4 property id (`properties/123` form is also accepted). */
  GA4_PROPERTY_ID?: string;
  /** Whole service-account key file, JSON-encoded, as a Worker secret. */
  GA4_SERVICE_ACCOUNT_JSON?: string;
}

export type Ga4SyncStatus = "ok" | "skipped" | "unconfigured" | "error";

export interface Ga4SyncResult {
  status: Ga4SyncStatus;
  /** Reason for a non-`ok` status; short and non-sensitive. */
  reason?: string;
  /** Only on `ok`: when the snapshot was stored, epoch seconds. */
  fetchedAt?: number;
}

/** Accepts `123456` and `properties/123456`; rejects anything else. */
export function normalizeGa4PropertyId(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const id = trimmed.startsWith("properties/")
    ? trimmed.slice("properties/".length)
    : trimmed;
  return /^\d{1,20}$/.test(id) ? id : null;
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Daily series: one point per day, unsorted and gap-free rows dropped. */
function dailyPoints(
  rows: {
    dimensions: string[];
    metrics: (number | null)[];
  }[]
): Ga4DayPoint[] {
  const points: Ga4DayPoint[] = [];
  for (const row of rows) {
    const date = ga4DateFromCompact(row.dimensions[0] ?? "");
    const views = finite(row.metrics[0]);
    const users = finite(row.metrics[1]);
    const sessions = finite(row.metrics[2]);
    if (!date || views === null || users === null || sessions === null) {
      continue;
    }
    points.push({ date, views, users, sessions });
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Top-N by a metric, skipping rows GA4 could not give a number for. */
function namedRows(
  rows: { dimensions: string[]; metrics: (number | null)[] }[]
): Ga4NamedRow[] {
  const out: Ga4NamedRow[] = [];
  for (const row of rows) {
    const name = (row.dimensions[0] ?? "").trim();
    const views = finite(row.metrics[0]);
    const users = finite(row.metrics[1] ?? 0);
    if (!name || views === null) continue;
    out.push({ name: name.slice(0, 300), views, users: users ?? 0 });
  }
  return out.sort((a, b) => b.views - a.views).slice(0, GA4_TOP_ROWS);
}

/**
 * A totals report with no rows means GA4 had nothing to say — a brand-new
 * property, a filter that excluded everything, or an upstream hiccup. That is
 * an error, not an audience of zero: returning zeros here would paint a
 * confident "no one visited" over an unanswered question.
 */
function totalsFromRows(
  rows: { dimensions: string[]; metrics: (number | null)[] }[]
): Ga4Totals | null {
  const row = rows[0];
  if (!row) return null;
  const views = finite(row.metrics[0]);
  const users = finite(row.metrics[1]);
  const sessions = finite(row.metrics[2]);
  const newUsers = finite(row.metrics[3]);
  if (
    views === null ||
    users === null ||
    sessions === null ||
    newUsers === null
  ) {
    return null;
  }
  return { views, users, sessions, newUsers };
}

const DAILY_REQUEST: RunReportRequest = {
  dateRanges: [
    { startDate: `${GA4_SERIES_DAYS - 1}daysAgo`, endDate: "today" },
  ],
  dimensions: [{ name: "date" }],
  metrics: [
    { name: "screenPageViews" },
    { name: "activeUsers" },
    { name: "sessions" },
  ],
  orderBys: [{ dimension: { dimensionName: "date" } }],
  limit: String(GA4_SERIES_DAYS + 10),
  keepEmptyRows: false,
};

const TOTALS_REQUEST: RunReportRequest = {
  dateRanges: [
    { startDate: `${GA4_TOTALS_DAYS - 1}daysAgo`, endDate: "today" },
  ],
  dimensions: [],
  metrics: [
    { name: "screenPageViews" },
    { name: "totalUsers" },
    { name: "sessions" },
    { name: "newUsers" },
  ],
  keepEmptyRows: false,
};

function topByRequest(dimension: string): RunReportRequest {
  return {
    dateRanges: [
      { startDate: `${GA4_TOTALS_DAYS - 1}daysAgo`, endDate: "today" },
    ],
    dimensions: [{ name: dimension }],
    metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: String(GA4_TOP_ROWS * 5),
    keepEmptyRows: false,
  };
}

export async function writeGa4Snapshot(
  db: Pick<D1Database, "prepare">,
  snapshot: Ga4Snapshot
): Promise<void> {
  await db
    .prepare(GA4_SNAPSHOT_SQL)
    .bind(
      GA4_SNAPSHOT_ID,
      snapshot.propertyId,
      snapshot.fetchedAt,
      JSON.stringify(snapshot)
    )
    .run();
}

/** D1 reports an unmigrated table as "no such table". */
export function isMissingGa4Table(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table|has no table|unknown table/i.test(message);
}

/** Cheapest statement that proves migration 0028 has been applied. */
export const GA4_TABLE_PROBE_SQL = "SELECT id FROM ga4_insights LIMIT 1";

let ga4TableSupported: boolean | null = null;

/** Test seam: the probe is cached per isolate, like the other D1 probes. */
export function resetGa4TableProbe(): void {
  ga4TableSupported = null;
}

/**
 * Has migration 0028 been applied? Applying migrations is an operator step,
 * so the sync *reports* the state instead of assuming it: without this probe
 * an un-migrated database would spend a Google token exchange every day only
 * to fail on the write, and an unconfigured cron must stay silent.
 */
export async function hasGa4Table(
  db: Pick<D1Database, "prepare">
): Promise<boolean> {
  if (ga4TableSupported != null) return ga4TableSupported;
  try {
    await db.prepare(GA4_TABLE_PROBE_SQL).all();
    ga4TableSupported = true;
  } catch (error) {
    if (!isMissingGa4Table(error)) {
      // A transient D1 failure is not a schema answer; let the caller decide
      // rather than caching "unsupported" for the life of the isolate.
      ga4TableSupported = null;
      throw error;
    }
    ga4TableSupported = false;
  }
  return ga4TableSupported;
}

/** Last stored snapshot header, or null. Used for the 24-hour gate. */
export async function readGa4SnapshotFetchedAt(
  db: Pick<D1Database, "prepare">,
  id: string = GA4_SNAPSHOT_ID
): Promise<number | null> {
  const row = await db
    .prepare("SELECT fetched_at FROM ga4_insights WHERE id = ?")
    .bind(id)
    .first<{ fetched_at: number | null }>();
  const value = row?.fetched_at;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/**
 * Pull the property and replace the stored snapshot. Every failure path
 * returns a status and leaves the previous snapshot in place, so a broken
 * sync can never shrink the audience numbers to zero.
 */
export async function syncGa4Insights(
  env: Ga4SyncEnv,
  opts: { now?: number; fetcher?: typeof fetch } = {}
): Promise<Ga4SyncResult> {
  const propertyId = normalizeGa4PropertyId(env.GA4_PROPERTY_ID);
  if (!propertyId)
    return { status: "unconfigured", reason: "property id unset" };

  const account = parseGa4ServiceAccount(env.GA4_SERVICE_ACCOUNT_JSON);
  if (!account) {
    return { status: "unconfigured", reason: "service account unset" };
  }
  if (!env.DB) {
    return { status: "unconfigured", reason: "D1 binding DB not configured" };
  }
  // Check the destination before spending a Google round-trip: an un-migrated
  // database cannot store the result, and the write would only fail later.
  if (!(await hasGa4Table(env.DB))) {
    return { status: "unconfigured", reason: "migration 0028 not applied" };
  }

  const fetcher = opts.fetcher ?? fetch;
  const nowSec = toEpochSeconds(opts.now ?? Date.now());

  try {
    const token = await fetchGa4AccessToken(account, {
      now: nowSec,
      fetcher,
    });

    const [daily, totals, pages, sources] = await Promise.all([
      runGa4Report(propertyId, token, DAILY_REQUEST, fetcher),
      runGa4Report(propertyId, token, TOTALS_REQUEST, fetcher),
      runGa4Report(propertyId, token, topByRequest("pagePath"), fetcher),
      runGa4Report(propertyId, token, topByRequest("sessionSource"), fetcher),
    ]);

    const totalsRow = totalsFromRows(totals.rows);
    if (!totalsRow) {
      return { status: "error", reason: "GA4 returned no totals row" };
    }

    const snapshot: Ga4Snapshot = {
      version: 1,
      propertyId,
      fetchedAt: nowSec,
      daily: dailyPoints(daily.rows),
      totals: totalsRow,
      topPages: namedRows(pages.rows),
      sources: namedRows(sources.rows),
    };

    await writeGa4Snapshot(env.DB, snapshot);
    return { status: "ok", fetchedAt: nowSec };
  } catch (error) {
    console.error("ga4 sync failed:", error);
    return {
      status: "error",
      // Both error classes already carry a short, sanitized reason (a status
      // code or a timeout), and the sync runs admin-gated — an operator
      // needs to tell a 403 (no access to the property) from a 429 (quota).
      reason:
        error instanceof Error &&
        (error.name === "Ga4AuthError" || error.name === "Ga4ReportError")
          ? error.message
          : "GA4 request failed",
    };
  }
}

/**
 * The alarm-driven entry point: sync at most once per
 * `GA4_SYNC_INTERVAL_MS`. A missing credential is not an error — this runs
 * on the ingest alarm, and an unconfigured GA4 must stay silent.
 */
export async function maybeSyncGa4Insights(
  env: Ga4SyncEnv,
  opts: {
    now?: number;
    fetcher?: typeof fetch;
    intervalMs?: number;
  } = {}
): Promise<Ga4SyncResult> {
  if (!normalizeGa4PropertyId(env.GA4_PROPERTY_ID)) {
    return { status: "unconfigured", reason: "property id unset" };
  }
  if (!parseGa4ServiceAccount(env.GA4_SERVICE_ACCOUNT_JSON)) {
    return { status: "unconfigured", reason: "service account unset" };
  }
  if (!env.DB) {
    return { status: "unconfigured", reason: "D1 binding DB not configured" };
  }
  if (!(await hasGa4Table(env.DB))) {
    return { status: "unconfigured", reason: "migration 0028 not applied" };
  }

  const nowMs = opts.now ?? Date.now();
  const intervalMs = opts.intervalMs ?? GA4_SYNC_INTERVAL_MS;
  const last = await readGa4SnapshotFetchedAt(env.DB);
  if (last !== null && nowMs - last * 1000 < intervalMs) {
    return { status: "skipped", reason: "synced recently" };
  }
  return syncGa4Insights(env, { now: nowMs, fetcher: opts.fetcher });
}
