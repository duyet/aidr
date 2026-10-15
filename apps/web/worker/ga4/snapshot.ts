/**
 * The stored GA4 snapshot: shape, validation, and the derived audience
 * numbers the /data Audience tab renders.
 *
 * This file is the single contract between the sync that writes
 * `ga4_insights.payload` and the read path that serves
 * `GET /api/system/audience`. Both sides go through the parser here, so a
 * hand-edited or half-written row degrades to "no data" instead of rendering
 * a fabricated DAU.
 */

/** Daily series window. GA4 keeps 14 months; 90 days is plenty for a chart
 *  and keeps the stored payload small. */
export const GA4_SERIES_DAYS = 90;
/** Rolling window for the headline totals (and therefore for MAU). */
export const GA4_TOTALS_DAYS = 28;
/** Rows kept per top-N table (pages, channels, source / medium, landing
 *  pages). */
export const GA4_TOP_ROWS = 10;

export interface Ga4DayPoint {
  /** `YYYY-MM-DD`, normalised from GA4's `YYYYMMDD`. */
  date: string;
  views: number;
  /** `activeUsers` for that day. */
  users: number;
  sessions: number;
}

export interface Ga4NamedRow {
  name: string;
  views: number;
  users: number;
}

/** One row of an acquisition table, ranked by sessions. `users` is
 *  `activeUsers` for that row. */
export interface Ga4SessionRow {
  name: string;
  sessions: number;
  users: number;
}

export interface Ga4Totals {
  views: number;
  /** `totalUsers` — distinct users across the window, which is what makes
   *  this the MAU figure. Never a sum of daily `activeUsers`: a user active
   *  on three days is one monthly user, not three. */
  users: number;
  sessions: number;
  newUsers: number;
}

export interface Ga4Snapshot {
  version: 1;
  propertyId: string;
  /** Epoch seconds when the Worker stored this snapshot. */
  fetchedAt: number;
  daily: Ga4DayPoint[];
  totals: Ga4Totals;
  topPages: Ga4NamedRow[];
  /** `sessionDefaultChannelGroup`, e.g. `Organic Search`. */
  channels: Ga4SessionRow[];
  /** `sessionSource` + `sessionMedium`, named like `telegram / social`. */
  sourceMedium: Ga4SessionRow[];
  /** `landingPage`, path only (see `landingPagePath`). */
  landingPages: Ga4SessionRow[];
}

/** Headline audience numbers, all derived from a validated snapshot. */
export interface Ga4Audience {
  /** `activeUsers` on the most recent day in the series. */
  dau: number | null;
  /** `totalUsers` over the trailing 28 days. */
  mau: number;
  /** MAU/DAU as a percentage, or null when either side is unavailable. */
  stickiness: number | null;
  views28d: number;
  sessions28d: number;
  newUsers28d: number;
  views7d: number;
  /** Mean daily views across the daily series, rounded. */
  avgDailyViews: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A count is only a count if it is a finite, non-negative number. */
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function shortText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseDayPoint(value: unknown): Ga4DayPoint | null {
  if (!isRecord(value)) return null;
  const date = shortText(value.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const views = count(value.views);
  const users = count(value.users);
  const sessions = count(value.sessions);
  if (views === null || users === null || sessions === null) return null;
  return { date, views, users, sessions };
}

function parseNamedRow(value: unknown): Ga4NamedRow | null {
  if (!isRecord(value)) return null;
  const name = shortText(value.name, 300);
  if (!name) return null;
  const views = count(value.views);
  const users = count(value.users);
  if (views === null || users === null) return null;
  return { name, views, users };
}

/**
 * The snapshot is served by a public endpoint, and the 28-day window still
 * holds hits recorded before URLs were scrubbed, so a landing page keeps its
 * path only: a query or hash can carry a token (`?unsubscribe=…`).
 */
export function landingPagePath(name: string): string {
  return name.replace(/[?#][\s\S]*$/, "").trim();
}

function parseSessionRow(
  value: unknown,
  cleanName: (name: string) => string
): Ga4SessionRow | null {
  if (!isRecord(value)) return null;
  const name = cleanName(shortText(value.name, 300));
  if (!name) return null;
  const sessions = count(value.sessions);
  const users = count(value.users);
  if (sessions === null || users === null) return null;
  return { name, sessions, users };
}

/**
 * Sessions-descending, one row per name, capped. Stripping a landing page's
 * query can make two rows share a name. A session has exactly one landing
 * page, so their sessions add up; their users may overlap, so the larger
 * count is the honest floor.
 */
export function topSessionRows(rows: Ga4SessionRow[]): Ga4SessionRow[] {
  const byName = new Map<string, Ga4SessionRow>();
  for (const row of rows) {
    const prev = byName.get(row.name);
    byName.set(
      row.name,
      prev
        ? {
            name: row.name,
            sessions: prev.sessions + row.sessions,
            users: Math.max(prev.users, row.users),
          }
        : row
    );
  }
  return [...byName.values()]
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, GA4_TOP_ROWS);
}

function parseSessionRows(
  value: unknown,
  cleanName: (name: string) => string = (name) => name
): Ga4SessionRow[] {
  // Read past the cap so merging names cannot leave the table short.
  return topSessionRows(
    parseArray(value, GA4_TOP_ROWS * 5, (entry) =>
      parseSessionRow(entry, cleanName)
    ) as Ga4SessionRow[]
  );
}

function parseArray(
  value: unknown,
  cap: number,
  parse: (v: unknown) => unknown
): unknown[] {
  if (!Array.isArray(value)) return [];
  const out: unknown[] = [];
  for (const entry of value.slice(0, cap)) {
    const parsed = parse(entry);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Validate a stored payload. Returns null unless the core identity and the
 * totals are intact — a snapshot without totals is an upstream failure, not a
 * quiet zero audience. A row written before the acquisition tables existed
 * parses with those tables empty.
 */
export function parseGa4Snapshot(raw: unknown): Ga4Snapshot | null {
  const value = typeof raw === "string" ? safeJsonParse(raw) : raw;
  if (!isRecord(value)) return null;
  if (value.version !== 1) return null;

  const propertyId = shortText(value.propertyId, 32);
  if (!propertyId) return null;
  const fetchedAt = count(value.fetchedAt);
  if (fetchedAt === null) return null;

  const totalsRaw = value.totals;
  if (!isRecord(totalsRaw)) return null;
  const views = count(totalsRaw.views);
  const users = count(totalsRaw.users);
  const sessions = count(totalsRaw.sessions);
  const newUsers = count(totalsRaw.newUsers);
  if (
    views === null ||
    users === null ||
    sessions === null ||
    newUsers === null
  ) {
    return null;
  }

  return {
    version: 1,
    propertyId,
    fetchedAt,
    daily: parseArray(
      value.daily,
      GA4_SERIES_DAYS,
      parseDayPoint
    ) as Ga4DayPoint[],
    totals: { views, users, sessions, newUsers },
    topPages: parseArray(
      value.topPages,
      GA4_TOP_ROWS,
      parseNamedRow
    ) as Ga4NamedRow[],
    channels: parseSessionRows(value.channels),
    sourceMedium: parseSessionRows(value.sourceMedium),
    landingPages: parseSessionRows(value.landingPages, landingPagePath),
  };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Headline numbers from a validated snapshot.
 *
 * DAU is the *latest* day in the series, never a window average — an average
 * would quietly relabel a metric. An empty series yields `null` for DAU while
 * the 28-day totals (which came from their own report) still stand, so one
 * missing day cannot blank the tab.
 */
export function ga4Audience(snapshot: Ga4Snapshot): Ga4Audience {
  const daily = [...snapshot.daily].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
  const dau = daily.length ? (daily[daily.length - 1]?.users ?? null) : null;

  const mau = snapshot.totals.users;
  const stickiness =
    dau !== null && dau > 0 && mau > 0
      ? Math.round((dau / mau) * 1000) / 10
      : null;

  const views7d = daily.slice(-7).reduce((sum, point) => sum + point.views, 0);
  const avgDailyViews = daily.length
    ? Math.round(
        daily.reduce((sum, point) => sum + point.views, 0) / daily.length
      )
    : 0;

  return {
    dau,
    mau,
    stickiness,
    views28d: snapshot.totals.views,
    sessions28d: snapshot.totals.sessions,
    newUsers28d: snapshot.totals.newUsers,
    views7d,
    avgDailyViews,
  };
}
