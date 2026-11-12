/**
 * Hourly Worker traffic from the Cloudflare GraphQL Analytics API
 * (`workersInvocationsAdaptive`), compared with the same UTC hour over the
 * 7 days before. Read by the health check (volume and response-time alerts)
 * and by `GET /api/admin/diagnostics`.
 *
 * The token is the optional `CF_ANALYTICS_API_TOKEN` secret (Account
 * Analytics: Read). Without it, or when the API refuses, the result is a
 * status with a reason, never an hour of zeros.
 */

import type { HealthIssue } from "./health.js";
import { sanitizeText } from "./telemetry-safe.js";
import type { Env } from "./types.js";

/** Both match `apps/web/wrangler.toml` (`name`, `account_id`); a test
 * reads the file. */
export const TRAFFIC_SCRIPT_NAME = "aidr";
export const CF_ACCOUNT_ID = "18bb51bef63a88086717388ed7f3008e";

const HOUR_MS = 3600 * 1000;
export const TRAFFIC_WINDOW_HOURS = 48;
export const TRAFFIC_BASELINE_DAYS = 7;
/** An hour is read only once it ended this long ago, so analytics
 * ingestion lag cannot read as a quiet hour. */
export const TRAFFIC_SETTLE_MS = 10 * 60 * 1000;
/** Baselines and the backtest behind these four: ALGORITHM.md, "Ops
 * pitfalls", traffic and response time. */
export const TRAFFIC_LOW_RATIO = 0.4;
export const TRAFFIC_SLOW_RATIO = 2;
export const TRAFFIC_ALERT_HOURS = 3;
export const TRAFFIC_MIN_BASELINE = 300;
export const TRAFFIC_LOW_KEY = "traffic-low";
export const TRAFFIC_SLOW_KEY = "traffic-slow";
const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const GRAPHQL_TIMEOUT_MS = 10_000;

export interface TrafficHour {
  /** Hour start, ISO UTC. */
  hour: string;
  /** Every invocation: page and API requests, the ingest Workflow, the
   * scheduler alarm. An hour with no analytics row counts as 0. */
  requests: number;
  errors: number;
  /** Wall time of successful invocations. It includes `waitUntil` and the
   * Workflow steps, so p99 jumps to minutes in hours a step lands in. */
  wallP50Ms: number | null;
  wallP99Ms: number | null;
  /** Time to deliver the response of successful invocations; the latency
   * alert reads this one. */
  responseP99Ms: number | null;
  /** Medians of the same UTC hour on each of the 7 days before. */
  baseline: { requests: number; responseP99Ms: number | null };
}

export type TrafficReport =
  | { status: "ok"; hours: TrafficHour[] }
  | { status: "unconfigured" | "error"; reason: string };

export type TrafficVerdict =
  | "normal"
  | "low"
  | "slow"
  | "unconfigured"
  | "error";

interface AnalyticsRow {
  dimensions: { datetimeHour: string; status: string };
  sum: { requests: number; errors: number };
  quantiles?: {
    wallTimeP50?: unknown;
    wallTimeP99?: unknown;
    requestDurationP99?: unknown;
  };
}

const QUERY = `query Traffic($account: String!, $script: String!, $from: Time!, $to: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    workersInvocationsAdaptive(limit: 5000,
      filter: { scriptName: $script, datetimeHour_geq: $from, datetimeHour_lt: $to }) {
      dimensions { datetimeHour status }
      sum { requests errors }
      quantiles { wallTimeP50 wallTimeP99 requestDurationP99 }
    }
  } }
}`;

/** Counts must parse or the whole read is an error, since a dropped row
 * would read as missing traffic. A bad latency field only blanks itself. */
function isAnalyticsRow(value: unknown): value is AnalyticsRow {
  const row = value as AnalyticsRow | null;
  return (
    typeof row?.dimensions?.datetimeHour === "string" &&
    typeof row.dimensions.status === "string" &&
    typeof row.sum?.requests === "number" &&
    typeof row.sum.errors === "number"
  );
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const ms = (us: unknown) =>
  typeof us === "number" && Number.isFinite(us) ? Math.round(us / 1000) : null;

/** Start of the newest hour that has settled, epoch ms. Hours before it
 * are complete. */
export function settledHourEnd(nowMs: number): number {
  return Math.floor((nowMs - TRAFFIC_SETTLE_MS) / HOUR_MS) * HOUR_MS;
}

/**
 * Folds analytics rows (one per hour and invocation status) into the last
 * `TRAFFIC_WINDOW_HOURS` complete hours with their baselines. Latency comes
 * from the `success` row only: one client-disconnected invocation held open
 * for minutes otherwise sets the hour's percentiles.
 */
export function buildTrafficHours(
  rows: readonly AnalyticsRow[],
  endMs: number
): TrafficHour[] {
  const span = TRAFFIC_WINDOW_HOURS + TRAFFIC_BASELINE_DAYS * 24;
  const startMs = endMs - span * HOUR_MS;
  const series = Array.from({ length: span }, (_, i) => ({
    hour: new Date(startMs + i * HOUR_MS).toISOString(),
    requests: 0,
    errors: 0,
    wallP50Ms: null as number | null,
    wallP99Ms: null as number | null,
    responseP99Ms: null as number | null,
  }));
  for (const row of rows) {
    const index = (Date.parse(row.dimensions.datetimeHour) - startMs) / HOUR_MS;
    const hour = series[index];
    if (!hour) continue;
    hour.requests += row.sum.requests;
    hour.errors += row.sum.errors;
    if (row.dimensions.status === "success") {
      hour.wallP50Ms = ms(row.quantiles?.wallTimeP50);
      hour.wallP99Ms = ms(row.quantiles?.wallTimeP99);
      hour.responseP99Ms = ms(row.quantiles?.requestDurationP99);
    }
  }
  return series.slice(-TRAFFIC_WINDOW_HOURS).map((hour, i) => {
    const index = span - TRAFFIC_WINDOW_HOURS + i;
    const prior = Array.from(
      { length: TRAFFIC_BASELINE_DAYS },
      (_, day) => series[index - (day + 1) * 24]
    );
    return {
      ...hour,
      baseline: {
        requests: median(prior.map((p) => p.requests)) ?? 0,
        responseP99Ms: median(
          prior.flatMap((p) =>
            p.responseP99Ms === null ? [] : [p.responseP99Ms]
          )
        ),
      },
    };
  });
}

/** Never throws: a missing token, a refusal or a timeout is a status. */
export async function fetchTraffic(
  env: Pick<Env, "CF_ANALYTICS_API_TOKEN">,
  nowMs: number
): Promise<TrafficReport> {
  const token = env.CF_ANALYTICS_API_TOKEN;
  if (!token) {
    return { status: "unconfigured", reason: "CF_ANALYTICS_API_TOKEN unset" };
  }
  const endMs = settledHourEnd(nowMs);
  const span = TRAFFIC_WINDOW_HOURS + TRAFFIC_BASELINE_DAYS * 24;
  try {
    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          account: CF_ACCOUNT_ID,
          script: TRAFFIC_SCRIPT_NAME,
          from: new Date(endMs - span * HOUR_MS).toISOString(),
          to: new Date(endMs).toISOString(),
        },
      }),
      signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        status: "error",
        reason: `analytics API HTTP ${response.status}`,
      };
    }
    const body = (await response.json()) as {
      data?: {
        viewer?: { accounts?: { workersInvocationsAdaptive?: unknown }[] };
      };
      errors?: { message?: unknown }[] | null;
    };
    if (body.errors?.length) {
      const message = sanitizeText(body.errors[0]?.message, 120) ?? "unknown";
      return { status: "error", reason: `analytics API: ${message}` };
    }
    const rows = body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
    if (!Array.isArray(rows) || !rows.every(isAnalyticsRow)) {
      return {
        status: "error",
        reason: "analytics API returned an unexpected shape",
      };
    }
    return { status: "ok", hours: buildTrafficHours(rows, endMs) };
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    return { status: "error", reason: `analytics API request: ${name}` };
  }
}

function hourLine(h: TrafficHour): string {
  return `${h.hour.slice(5, 13)}h: ${h.requests} req (median ${h.baseline.requests}), response p99 ${h.responseP99Ms ?? "-"}ms (median ${h.baseline.responseP99Ms ?? "-"}ms)`;
}

/** Pure. One issue per rule whose condition held for each of the last
 * `TRAFFIC_ALERT_HOURS` complete hours, unless its key fired in the 24h
 * window (`alerted`). */
export function evaluateTraffic(
  report: TrafficReport,
  alerted: ReadonlySet<string>
): HealthIssue[] {
  if (report.status !== "ok") return [];
  const recent = report.hours.slice(-TRAFFIC_ALERT_HOURS);
  if (
    recent.length < TRAFFIC_ALERT_HOURS ||
    recent.some((h) => h.baseline.requests < TRAFFIC_MIN_BASELINE)
  ) {
    return [];
  }
  const evidence = recent.map(hourLine);
  const issues: HealthIssue[] = [];
  const low = recent.every(
    (h) => h.requests < TRAFFIC_LOW_RATIO * h.baseline.requests
  );
  if (low && !alerted.has(TRAFFIC_LOW_KEY)) {
    issues.push({
      key: TRAFFIC_LOW_KEY,
      severity: "warning",
      title: "Worker traffic low",
      detail: `Requests under ${TRAFFIC_LOW_RATIO * 100}% of the same hour's 7-day median for ${TRAFFIC_ALERT_HOURS} hours: ${recent.map((h) => `${h.requests}/${h.baseline.requests}`).join(", ")}`,
      evidence,
    });
  }
  const slow = recent.every(
    (h) =>
      h.responseP99Ms !== null &&
      h.baseline.responseP99Ms !== null &&
      h.responseP99Ms > TRAFFIC_SLOW_RATIO * h.baseline.responseP99Ms
  );
  if (slow && !alerted.has(TRAFFIC_SLOW_KEY)) {
    issues.push({
      key: TRAFFIC_SLOW_KEY,
      severity: "warning",
      title: "Worker responses slow",
      detail: `Response p99 over ${TRAFFIC_SLOW_RATIO}x the same hour's 7-day median for ${TRAFFIC_ALERT_HOURS} hours: ${recent.map((h) => `${h.responseP99Ms}/${h.baseline.responseP99Ms}ms`).join(", ")}`,
      evidence,
    });
  }
  return issues;
}

/** Diagnostics verdict: the same rules, ignoring the 24h alert window. */
export function trafficVerdict(report: TrafficReport): TrafficVerdict {
  if (report.status !== "ok") return report.status;
  const keys = evaluateTraffic(report, new Set()).map((issue) => issue.key);
  if (keys.includes(TRAFFIC_LOW_KEY)) return "low";
  if (keys.includes(TRAFFIC_SLOW_KEY)) return "slow";
  return "normal";
}
