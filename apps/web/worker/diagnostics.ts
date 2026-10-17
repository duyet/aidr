/**
 * `GET /api/admin/diagnostics` (MCP `get_diagnostics`, `agent diagnose`):
 * one small report a local agent reads to tell why the site is slow or
 * quiet. Pure assembly lives here; `getDiagnostics` in
 * `worker/admin/handlers.ts` does the reads.
 *
 * Run errors and step notes pass through the same sanitizers as
 * `/api/admin/status`, so the report exposes no more than it does.
 */

import { hasFailedStep, RUN_FRESH_SEC } from "../src/lib/run-health.js";
import type { SourceHealthView } from "../src/lib/system-queries.js";
import { MARKER_PREFIXES, parsePriorRun } from "./health.js";
import { INGEST_MIN_INTERVAL_MS } from "./ingest-schedule.js";
import { sanitizeRunError, sanitizeRunStatsJson } from "./telemetry-safe.js";
import {
  type TrafficReport,
  type TrafficVerdict,
  trafficVerdict,
} from "./traffic.js";
import {
  NOT_DRY_RUN_SQL,
  WORKFLOW_RUN_STARTED_AT_ORDER_SQL,
} from "./workflow-run.js";

const MINUTE_MS = 60 * 1000;
export const DIAGNOSTICS_RUNS = 10;
export const DIAGNOSTICS_ALERT_WINDOW_MS = 48 * 3600 * 1000;
/** Alerts count as open for this long after they fire. */
const OPEN_ALERT_MS = 24 * 3600 * 1000;
/** Queue rows each `stuck` count reads, newest first. A queue longer than
 * this undercounts its oldest rows; one run drains at most 45. */
export const STUCK_SCAN_LIMIT = 1000;
/** A row still queued this long after it was first fetched is stuck, not
 * waiting for the next run. */
export const STUCK_AGE_SEC = 24 * 3600;

/** `fresh`: a live run finished within `RUN_FRESH_SEC`. `late`: the newest
 * finished run is older. `stuck`: the newest run is still open past the
 * 25-minute coalesce window. */
export type IngestVerdict = "fresh" | "late" | "stuck" | "none";
/** The newest finished live run. */
export type LastRunVerdict = "ok" | "degraded" | "failed" | "none";

export interface DiagnosticsRun {
  id: string;
  startedAt: string | null;
  /** Null until the run records its `close-run` step. */
  finishedAt: string | null;
  itemsFetched: number | null;
  itemsNew: number | null;
  error: string | null;
  /** `name: action (reason)` of each step that reported a failure. */
  failedSteps: string[];
}

export interface DiagnosticsAlert {
  runId: string;
  at: string | null;
  keys: string[];
}

export interface StuckCounts {
  /** English rows the en-summary backfill skips: no text after boilerplate
   * at their current revision. */
  enSummaryNoText: number;
  /** Rows still in each backfill queue 24h after they were fetched. These
   * retry every run with no attempt cap. */
  enSummaryOver24h: number;
  translateOver24h: number;
  unscoredOver24h: number;
}

export interface DiagnosticsSources {
  stale: string[];
  failing: string[];
  /** Enabled sources with a silent or failing streak, longest first. */
  streaks: {
    id: string;
    emptyRuns: number;
    staleAfterRuns: number;
    failedRuns: number;
  }[];
}

export interface DiagnosticsReport {
  generatedAt: string;
  verdicts: {
    ingest: IngestVerdict;
    lastRun: LastRunVerdict;
    traffic: TrafficVerdict;
    /** Sum of the `*Over24h` counts. `enSummaryNoText` rows are left out:
     * they are settled, not retrying. */
    stuckRows: number;
    /** Alert keys fired in the last 24h, markers left out. */
    openAlerts: string[];
  };
  ingest: {
    newestFinishedAgeMin: number | null;
    stuckRun: { id: string; startedAt: string; ageMin: number } | null;
  };
  runs: DiagnosticsRun[];
  alerts: DiagnosticsAlert[];
  sources: DiagnosticsSources;
  stuck: StuckCounts;
  traffic: TrafficReport;
}

export interface RunRow {
  id: string;
  started_at: unknown;
  finished_at: unknown;
  items_fetched: number | null;
  items_new: number | null;
  error: unknown;
  stats: unknown;
}

/** Live runs only: a dry run says nothing about whether ingest is healthy. */
export const DIAGNOSTICS_RUNS_SQL = `SELECT id, started_at, finished_at, items_fetched, items_new, error, stats
  FROM workflow_runs WHERE ${NOT_DRY_RUN_SQL}
  ORDER BY ${WORKFLOW_RUN_STARTED_AT_ORDER_SQL} DESC, id DESC LIMIT ${DIAGNOSTICS_RUNS}`;

/** Only `stats.alerts` of each run, so 48h of runs stays a small read. */
export const DIAGNOSTICS_ALERT_RUNS_SQL = `SELECT id, started_at, finished_at, NULL AS items_fetched, NULL AS items_new, NULL AS error,
    CASE WHEN json_valid(stats) THEN json_object('alerts', json_extract(stats, '$.alerts')) END AS stats
  FROM workflow_runs
  WHERE ${WORKFLOW_RUN_STARTED_AT_ORDER_SQL} >= ? AND ${NOT_DRY_RUN_SQL}
  ORDER BY ${WORKFLOW_RUN_STARTED_AT_ORDER_SQL} DESC, id DESC`;

/** Count of a backfill queue's rows first fetched more than
 * `STUCK_AGE_SEC` ago. `queueSql` is the step's own SELECT, so the count
 * cannot drift from what the step loads. Binds the cutoff in epoch seconds. */
export function stuckQueueCountSql(queueSql: string): string {
  return `SELECT COUNT(*) AS n FROM (${queueSql}) q
          JOIN items stuck ON stuck.id = q.id WHERE stuck.fetched_at < ?`;
}

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

/** `workflow_runs` times are epoch seconds, with legacy millisecond rows. */
function epochMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value > 1e12 ? value : value * 1000;
}

interface ParsedRun extends DiagnosticsRun {
  startedAtMs: number | null;
  finishedAtMs: number | null;
  alertKeys: string[];
}

function parseRun(row: RunRow): ParsedRun {
  const stats =
    typeof row.stats === "string" ? sanitizeRunStatsJson(row.stats) : "{}";
  const run = parsePriorRun({ started_at: row.started_at, stats });
  // `finished_at` equals `started_at` on an opened row; `close-run` is the
  // last step every run records.
  const finishedAtMs = run.steps.some((s) => s.name === "close-run")
    ? epochMs(row.finished_at)
    : null;
  return {
    id: row.id,
    startedAtMs: run.startedAtMs,
    startedAt: iso(run.startedAtMs),
    finishedAtMs,
    finishedAt: iso(finishedAtMs),
    itemsFetched: row.items_fetched,
    itemsNew: row.items_new,
    error: sanitizeRunError(row.error),
    failedSteps: run.steps
      .filter((s) => hasFailedStep({ steps: [s] }))
      .map((s) => `${s.name}: ${s.action}${s.reason ? ` (${s.reason})` : ""}`),
    alertKeys: run.alerts.filter(
      (key) => !MARKER_PREFIXES.some((prefix) => key.startsWith(prefix))
    ),
  };
}

function sourceSection(source: {
  health: Record<string, SourceHealthView>;
  stale: string[];
  failing: string[];
}): DiagnosticsSources {
  const streaks = Object.entries(source.health)
    .flatMap(([id, h]) =>
      h.observed &&
      h.skipReason !== "disabled" &&
      (h.emptyRuns > 0 || h.failedRuns > 0)
        ? [
            {
              id,
              emptyRuns: h.emptyRuns,
              staleAfterRuns: h.staleAfterRuns,
              failedRuns: h.failedRuns,
            },
          ]
        : []
    )
    .sort((a, b) => b.emptyRuns - a.emptyRuns || b.failedRuns - a.failedRuns);
  return { stale: source.stale, failing: source.failing, streaks };
}

/** Pure. `runs` and `alertRuns` are live runs, newest first. */
export function buildDiagnosticsReport(input: {
  nowMs: number;
  runs: RunRow[];
  alertRuns: RunRow[];
  sources: {
    health: Record<string, SourceHealthView>;
    stale: string[];
    failing: string[];
  };
  stuck: StuckCounts;
  traffic: TrafficReport;
}): DiagnosticsReport {
  const { nowMs } = input;
  const runs = input.runs.map(parseRun);
  const newest = runs[0];
  const newestFinished = runs.find((r) => r.finishedAtMs !== null);
  const ageMin = (ms: number | null) =>
    ms === null ? null : Math.floor((nowMs - ms) / MINUTE_MS);
  const stuckRun =
    newest &&
    newest.finishedAtMs === null &&
    newest.startedAtMs !== null &&
    nowMs - newest.startedAtMs > INGEST_MIN_INTERVAL_MS
      ? {
          id: newest.id,
          startedAt: newest.startedAt ?? "",
          ageMin: ageMin(newest.startedAtMs) ?? 0,
        }
      : null;
  const newestFinishedAgeMin = ageMin(newestFinished?.finishedAtMs ?? null);

  const alertRuns = input.alertRuns.map(parseRun);
  const openAlerts = [
    ...new Set(
      alertRuns
        .filter(
          (r) => r.startedAtMs !== null && nowMs - r.startedAtMs < OPEN_ALERT_MS
        )
        .flatMap((r) => r.alertKeys)
    ),
  ].sort();

  const ingest: IngestVerdict = stuckRun
    ? "stuck"
    : newestFinishedAgeMin === null
      ? "none"
      : newestFinishedAgeMin * 60 <= RUN_FRESH_SEC
        ? "fresh"
        : "late";
  const lastRun: LastRunVerdict = !newestFinished
    ? "none"
    : newestFinished.error
      ? "failed"
      : newestFinished.failedSteps.length > 0
        ? "degraded"
        : "ok";

  return {
    generatedAt: new Date(nowMs).toISOString(),
    verdicts: {
      ingest,
      lastRun,
      traffic: trafficVerdict(input.traffic),
      stuckRows:
        input.stuck.enSummaryOver24h +
        input.stuck.translateOver24h +
        input.stuck.unscoredOver24h,
      openAlerts,
    },
    ingest: { newestFinishedAgeMin, stuckRun },
    runs: runs.map(
      ({ startedAtMs: _s, finishedAtMs: _f, alertKeys: _a, ...run }) => run
    ),
    alerts: alertRuns
      .filter((r) => r.alertKeys.length > 0)
      .map((r) => ({ runId: r.id, at: r.startedAt, keys: r.alertKeys })),
    sources: sourceSection(input.sources),
    stuck: input.stuck,
    traffic: input.traffic,
  };
}
