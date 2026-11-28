/**
 * Who pulls AI;DR news, read from the `aidr_usage` Analytics Engine dataset
 * (written by `src/lib/usage.ts`): requests per client bucket per UTC day,
 * and the app versions of the iOS app and the Chrome extension. Served by
 * `GET /api/admin/clients` and `agent clients`.
 *
 * Uses the same optional `CF_ANALYTICS_API_TOKEN` secret as `traffic.ts`
 * (Account Analytics: Read). Without it, or when the API refuses, the result
 * is a status with a reason, never zeros.
 */

import type { ClientBucket } from "../src/lib/usage.js";
import { sanitizeText } from "./telemetry-safe.js";
import { CF_ACCOUNT_ID } from "./traffic.js";
import type { Env } from "./types.js";

export const CLIENT_USAGE_DAYS = 7;
const SQL_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql`;
const SQL_TIMEOUT_MS = 10_000;

/** `_sample_interval` scales a sampled row back to the requests it stands for. */
export const CLIENT_DAILY_SQL = `SELECT toDate(timestamp) AS day, blob4 AS client,
       SUM(_sample_interval * double1) AS hits
FROM aidr_usage
WHERE timestamp > NOW() - INTERVAL '${CLIENT_USAGE_DAYS}' DAY
GROUP BY day, client
ORDER BY day DESC, hits DESC`;

/** Rows from before the version blob existed read it as empty. */
export const CLIENT_VERSIONS_SQL = `SELECT blob4 AS client, blob5 AS version,
       SUM(_sample_interval * double1) AS hits, MAX(timestamp) AS last_seen
FROM aidr_usage
WHERE timestamp > NOW() - INTERVAL '${CLIENT_USAGE_DAYS}' DAY AND blob5 != ''
GROUP BY client, version
ORDER BY hits DESC`;

export interface ClientDailyRow {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  client: ClientBucket;
  hits: number;
}

export interface ClientVersionRow {
  client: ClientBucket;
  version: string;
  hits: number;
  /** Newest data point, ISO UTC. */
  lastSeen: string;
}

export type ClientUsageReport =
  | {
      status: "ok";
      windowDays: number;
      /** Newest day first. Hits are a floor: Workers Cache answers some
       * API routes before the Worker runs (ALGORITHM.md, "Usage counters"). */
      daily: ClientDailyRow[];
      versions: ClientVersionRow[];
    }
  | { status: "unconfigured" | "error"; reason: string };

type SqlRow = Record<string, unknown>;

async function runSql(token: string, sql: string): Promise<SqlRow[]> {
  const response = await fetch(SQL_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: sql,
    signal: AbortSignal.timeout(SQL_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = sanitizeText(await response.text().catch(() => ""), 120);
    throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const body = (await response.json()) as { data?: unknown };
  if (!Array.isArray(body.data)) throw new Error("unexpected shape");
  return body.data as SqlRow[];
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** A bad row fails the whole read: a dropped row would read as no traffic. */
function hitsOf(row: SqlRow): number {
  const hits = Number(row.hits);
  if (!Number.isFinite(hits)) throw new Error("unexpected shape");
  return hits;
}

/** The dataset stores `YYYY-MM-DD HH:MM:SS` in UTC. */
function isoUtc(value: unknown): string {
  const raw = text(value);
  const ms = Date.parse(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

/** Never throws: a missing token, a refusal or a timeout is a status. */
export async function fetchClientUsage(
  env: Pick<Env, "CF_ANALYTICS_API_TOKEN">
): Promise<ClientUsageReport> {
  const token = env.CF_ANALYTICS_API_TOKEN;
  if (!token) {
    return { status: "unconfigured", reason: "CF_ANALYTICS_API_TOKEN unset" };
  }
  try {
    const [daily, versions] = await Promise.all([
      runSql(token, CLIENT_DAILY_SQL),
      runSql(token, CLIENT_VERSIONS_SQL),
    ]);
    return {
      status: "ok",
      windowDays: CLIENT_USAGE_DAYS,
      daily: daily.map((row) => ({
        day: text(row.day).slice(0, 10),
        client: text(row.client) as ClientBucket,
        hits: hitsOf(row),
      })),
      versions: versions.map((row) => ({
        client: text(row.client) as ClientBucket,
        version: text(row.version),
        hits: hitsOf(row),
        lastSeen: isoUtc(row.last_seen),
      })),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    return {
      status: "error",
      reason: `analytics SQL API: ${sanitizeText(reason, 160) ?? "unknown"}`,
    };
  }
}
