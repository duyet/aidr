import { GA4_SNAPSHOT_ID } from "../../worker/ga4/insights.js";
import {
  type Ga4Audience,
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
 * Per the `system-queries.ts` rule, every statement that is not guaranteed by
 * the migration ledger is probed individually first: a D1 `batch()` aborts
 * wholesale on one failing statement, so `ga4_insights` and the two
 * runtime-added mail columns stay out of the batch unless their probe passed.
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
  /** GA4 acquisition channels (organic search, direct, …) for the same 28
   *  days as the totals. Distinct from subscriber signup sources below. */
  sources: NamedCount[];
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
  /** Signup source per subscriber: blog / news / home / extension / unknown. */
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

let ga4TableSupported: boolean | null = null;
let digestSizeSupported: boolean | null = null;
let subscriberSourcesSupported: boolean | null = null;

/** Test seam: the probes are cached per isolate, like the system probes. */
export function resetAudienceProbes(): void {
  ga4TableSupported = null;
  digestSizeSupported = null;
  subscriberSourcesSupported = null;
}

async function probe(db: DbReader, sql: string): Promise<boolean> {
  try {
    await db.prepare(sql).all();
    return true;
  } catch {
    return false;
  }
}

/**
 * Migration-gated columns stay out of the batch unless probed. `digest_size`
 * and `subscriber_sources` are created by the mail runtime schema, not by a
 * numbered migration, so their presence genuinely varies per environment.
 */
async function probeAudienceSchema(db: DbReader): Promise<{
  hasGa4: boolean;
  hasDigestSize: boolean;
  hasSubscriberSources: boolean;
}> {
  const [hasGa4, hasDigestSize, hasSubscriberSources] = await Promise.all([
    ga4TableSupported ?? probe(db, "SELECT id FROM ga4_insights LIMIT 1"),
    digestSizeSupported ??
      probe(db, "SELECT digest_size FROM subscribers LIMIT 1"),
    subscriberSourcesSupported ??
      probe(db, "SELECT source FROM subscriber_sources LIMIT 1"),
  ]);
  ga4TableSupported = hasGa4;
  digestSizeSupported = hasDigestSize;
  subscriberSourcesSupported = hasSubscriberSources;
  return { hasGa4, hasDigestSize, hasSubscriberSources };
}

function emptyGa4(status: Ga4AudienceStatus): Ga4AudienceView {
  return {
    status,
    fetchedAt: null,
    audience: null,
    viewsPerDay: [],
    usersPerDay: [],
    topPages: [],
    sources: [],
  };
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
    sources: snapshot.sources.map((s) => ({ name: s.name, count: s.views })),
  };
}

/** The GA4 half, read on its own so a broken snapshot cannot 500 the
 *  subscriber counts sitting next to it. */
async function loadGa4Audience(
  db: DbReader,
  hasGa4: boolean,
  nowSec: number
): Promise<Ga4AudienceView> {
  if (!hasGa4) return emptyGa4("unconfigured");

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
  schema: { hasDigestSize: boolean; hasSubscriberSources: boolean }
): Promise<SubscriberAudience> {
  // Keyed, not positional: the two breakdown queries are each optional, so a
  // positional destructure would read the digest-size rows into `bySource` on
  // any database that has one column and not the other.
  const plan: [keyof SubscriberAudience, string][] = [
    ["confirmed", SQL.confirmedCount],
    ["unconfirmed", SQL.totalCount],
    ["new7d", SQL.new7d],
    ["new28d", SQL.new28d],
    ["newPerDay", SQL.newPerDay],
    ["byLang", SQL.byLang],
  ];
  if (schema.hasSubscriberSources) {
    plan.push(["bySource", BY_SOURCE_SQL]);
  }
  if (schema.hasDigestSize) {
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
  const schema = await probeAudienceSchema(db);
  // GA4 is read outside the batch: it is the one statement that can fail on an
  // unapplied migration, and it must not be able to take the subscriber
  // counts down with it.
  const ga4 = await loadGa4Audience(db, schema.hasGa4, nowSec);
  const subscribers = await loadSubscribers(db, schema);
  return { ga4, subscribers };
}
