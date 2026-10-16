import { GA4_SNAPSHOT_ID } from "../../worker/ga4/insights.js";
import {
  type Ga4Audience,
  type Ga4SessionRow,
  type Ga4Snapshot,
  ga4Audience,
  parseGa4Snapshot,
} from "../../worker/ga4/snapshot.js";
import type { DbReader } from "./db";
import type { DayCount, NamedCount } from "./system-queries";

/**
 * Read model for the /data Audience tab: page views, DAU/MAU, and the
 * subscriber breakdowns.
 *
 * Two different provenances meet here, and the response keeps them apart:
 *
 * - **GA4** numbers are a *snapshot* — Google owns the data, this Worker only
 *   stores the last successful pull (`ga4_insights`, migration 0028). A
 *   missing table, a table no sync has ever written, and an unreadable
 *   payload are three different, explicitly reported states. None of them is
 *   rendered as `0`: a confident zero audience over an unanswered question is
 *   the one number that must never appear here.
 * - **Subscriber** numbers are counted live from `subscribers` /
 *   `subscriber_sources`, so they are exact at read time and need no
 *   snapshot of their own.
 *
 * The deploy gate guarantees every migrated table, `ga4_insights` (0028) and
 * `subscriber_sources` (0015) included, so neither is probed. The one probe
 * left is `subscribers.digest_size`: no migration creates it (0019 is a
 * no-op), only `ensureMailSchema` does, and a D1 `batch()` aborts wholesale
 * on one failing statement.
 */

export type Ga4AudienceStatus =
  | "available"
  | "stale"
  | "unconfigured"
  | "error";

export interface Ga4AudienceView {
  status: Ga4AudienceStatus;
  /** Epoch seconds the stored snapshot was written, when there is one. */
  fetchedAt: number | null;
  /** Null unless the payload validated — never a partial object. */
  audience: Ga4Audience | null;
  viewsPerDay: DayCount[];
  usersPerDay: DayCount[];
  topPages: NamedCount[];
  /** GA4 sessions over the same 28 days as the totals, by default channel
   *  group, by `source / medium`, and by landing page. Distinct from the
   *  subscriber signup sources below. */
  channels: NamedCount[];
  sourceMedium: NamedCount[];
  landingPages: NamedCount[];
}

export interface DigestSizeCount {
  size: number;
  count: number;
}

export interface SubscriberAudience {
  /** Confirmed email subscriptions — the audience the digest actually reaches. */
  confirmed: number;
  /** Rows present but not yet confirmed, so the two never silently disagree. */
  unconfirmed: number;
  /** Signup source per subscriber: news / extension. Unknown sources are stored as news; rows from before that may still say blog or home. */
  bySource: NamedCount[];
  byLang: NamedCount[];
  byDigestSize: DigestSizeCount[];
  /** Confirmed signups per day over the trailing window. */
  newPerDay: DayCount[];
  new7d: number;
  new28d: number;
}

export interface AudienceStats {
  ga4: Ga4AudienceView;
  subscribers: SubscriberAudience;
}

/** A snapshot older than this is reported as `stale` — still shown, but
 *  labelled, because silently rendering week-old numbers as "today" is the
 *  same lie as rendering zero. */
export const GA4_STALE_AFTER_SECONDS = 48 * 60 * 60;

const WINDOW_DAYS = 90;

const SQL = {
  confirmedCount: "SELECT COUNT(*) AS c FROM subscribers WHERE confirmed = 1",
  totalCount: "SELECT COUNT(*) AS c FROM subscribers",
  new7d: `SELECT COUNT(*) AS c FROM subscribers
    WHERE confirmed = 1 AND created_at >= unixepoch('now', '-7 days')`,
  new28d: `SELECT COUNT(*) AS c FROM subscribers
    WHERE confirmed = 1 AND created_at >= unixepoch('now', '-28 days')`,
  newPerDay: `SELECT date(created_at, 'unixepoch') AS date, COUNT(*) AS count
    FROM subscribers
    WHERE confirmed = 1
      AND created_at IS NOT NULL
      AND created_at >= unixepoch('now', '-${WINDOW_DAYS} days')
    GROUP BY date ORDER BY date ASC`,
  byLang: `SELECT lang AS name, COUNT(*) AS count FROM subscribers
    WHERE confirmed = 1 GROUP BY name ORDER BY count DESC`,
} as const;

const BY_SOURCE_SQL = `SELECT COALESCE(src.source, 'unknown') AS name,
  COUNT(*) AS count
  FROM subscribers s
  LEFT JOIN subscriber_sources src ON src.email = s.email
  WHERE s.confirmed = 1
  GROUP BY name
  ORDER BY count DESC`;

const BY_DIGEST_SIZE_SQL = `SELECT COALESCE(digest_size, 5) AS size,
  COUNT(*) AS count
  FROM subscribers
  WHERE confirmed = 1
  GROUP BY size
  ORDER BY size ASC`;

const GA4_SELECT_SQL = `SELECT property_id, fetched_at, payload
  FROM ga4_insights
  WHERE id = ?`;

function firstRow<T>(res: { results?: unknown[] } | undefined): T | null {
  return ((res?.results ?? [])[0] as T) ?? null;
}

function resultRows<T>(res: { results?: unknown[] } | undefined): T[] {
  return (res?.results ?? []) as T[];
}

function scalar(res: { results?: unknown[] } | undefined): number {
  const value = firstRow<{ c: number | null }>(res)?.c;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

let digestSizeSupported: boolean | null = null;

/** Test seam: the probe is cached per isolate. */
export function resetAudienceProbes(): void {
  digestSizeSupported = null;
}

/** `digest_size` is added at runtime by `ensureMailSchema`, not by a numbered
 * migration, so its presence genuinely varies per environment. */
async function hasDigestSize(db: DbReader): Promise<boolean> {
  if (digestSizeSupported !== null) return digestSizeSupported;
  try {
    await db.prepare("SELECT digest_size FROM subscribers LIMIT 1").all();
    digestSizeSupported = true;
  } catch {
    digestSizeSupported = false;
  }
  return digestSizeSupported;
}

function emptyGa4(status: Ga4AudienceStatus): Ga4AudienceView {
  return {
    status,
    fetchedAt: null,
    audience: null,
    viewsPerDay: [],
    usersPerDay: [],
    topPages: [],
    channels: [],
    sourceMedium: [],
    landingPages: [],
  };
}

function sessionCounts(rows: Ga4SessionRow[]): NamedCount[] {
  return rows.map((row) => ({ name: row.name, count: row.sessions }));
}

function ga4View(snapshot: Ga4Snapshot, nowSec: number): Ga4AudienceView {
  const stale = nowSec - snapshot.fetchedAt > GA4_STALE_AFTER_SECONDS;
  return {
    status: stale ? "stale" : "available",
    fetchedAt: snapshot.fetchedAt,
    audience: ga4Audience(snapshot),
    viewsPerDay: snapshot.daily.map((d) => ({ date: d.date, count: d.views })),
    usersPerDay: snapshot.daily.map((d) => ({ date: d.date, count: d.users })),
    topPages: snapshot.topPages.map((p) => ({ name: p.name, count: p.views })),
    channels: sessionCounts(snapshot.channels),
    sourceMedium: sessionCounts(snapshot.sourceMedium),
    landingPages: sessionCounts(snapshot.landingPages),
  };
}

/** The GA4 half, read on its own so a broken snapshot cannot 500 the
 *  subscriber counts sitting next to it. */
async function loadGa4Audience(
  db: DbReader,
  nowSec: number
): Promise<Ga4AudienceView> {
  let row: { property_id: string; fetched_at: number; payload: string } | null;
  try {
    row = await db
      .prepare(GA4_SELECT_SQL)
      .bind(GA4_SNAPSHOT_ID)
      .first<{ property_id: string; fetched_at: number; payload: string }>();
  } catch (error) {
    console.error("audience/ga4 read failed:", error);
    return emptyGa4("error");
  }

  // No row means no sync has ever completed. Like the Clerk mirror, an empty
  // table cannot distinguish "no traffic" from "never asked" — and traffic
  // that predates the first sync is not zero. Report it as unconfigured.
  if (!row) return emptyGa4("unconfigured");

  const snapshot = parseGa4Snapshot(row.payload);
  if (!snapshot) {
    console.error("audience/ga4 snapshot failed validation");
    return { ...emptyGa4("error"), fetchedAt: row.fetched_at ?? null };
  }
  return ga4View(snapshot, nowSec);
}

async function loadSubscribers(
  db: DbReader,
  withDigestSize: boolean
): Promise<SubscriberAudience> {
  // Keyed, not positional: the digest-size breakdown is optional.
  const plan: [keyof SubscriberAudience, string][] = [
    ["confirmed", SQL.confirmedCount],
    ["unconfirmed", SQL.totalCount],
    ["new7d", SQL.new7d],
    ["new28d", SQL.new28d],
    ["newPerDay", SQL.newPerDay],
    ["byLang", SQL.byLang],
    ["bySource", BY_SOURCE_SQL],
  ];
  if (withDigestSize) {
    plan.push(["byDigestSize", BY_DIGEST_SIZE_SQL]);
  }

  const results = await db.batch(plan.map(([, sql]) => db.prepare(sql)));
  const rows = new Map<string, { results?: unknown[] }>();
  for (const [index, [key]] of plan.entries()) {
    rows.set(key, results[index] ?? {});
  }

  const confirmed = scalar(rows.get("confirmed"));
  const all = scalar(rows.get("unconfirmed"));

  return {
    confirmed,
    // Never negative: a row counted as confirmed but missing from the table
    // would otherwise render a negative "unconfirmed".
    unconfirmed: Math.max(all - confirmed, 0),
    bySource: resultRows<NamedCount>(rows.get("bySource")),
    byLang: resultRows<NamedCount>(rows.get("byLang")),
    byDigestSize: resultRows<{ size: number; count: number }>(
      rows.get("byDigestSize")
    ).map((row) => ({
      size: Number(row.size) || 0,
      count: Number(row.count) || 0,
    })),
    newPerDay: resultRows<DayCount>(rows.get("newPerDay")),
    new7d: scalar(rows.get("new7d")),
    new28d: scalar(rows.get("new28d")),
  };
}

/** One batched D1 read for the whole Audience tab. */
export async function loadAudienceStats(
  db: DbReader,
  opts: { now?: number } = {}
): Promise<AudienceStats> {
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  // GA4 is read outside the batch so a failed read cannot take the
  // subscriber counts down with it.
  const [ga4, subscribers] = await Promise.all([
    loadGa4Audience(db, nowSec),
    hasDigestSize(db).then((withDigestSize) =>
      loadSubscribers(db, withDigestSize)
    ),
  ]);
  return { ga4, subscribers };
}
