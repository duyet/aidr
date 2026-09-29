import { hasFailedStep } from "../src/lib/run-health.js";
import { reportHealthAlert } from "./bugsink.js";
import { flushLlmCallWrites } from "./llm-call-log.js";
import type { AlertEvent, AlertSeverity } from "./notify/alert.js";
import type { RunStepInfo } from "./run-stats.js";
import { getLocalHourAndDate } from "./subscribe/send.js";
import { AUDIENCE_TIMEZONE } from "./time.js";
import type { Env } from "./types.js";
import { WORKFLOW_RUN_STARTED_AT_ORDER_SQL } from "./workflow-run.js";

/**
 * In-pipeline health check, run once at close-run. Each hourly run looks at
 * its own steps and LLM calls plus recent history, and raises an alert
 * through the Sentry/Bugsink path when the pipeline is quietly broken
 * (e.g. Telegram silent for hours while every run "succeeds").
 *
 * Alert keys are written to the run's `stats.alerts`; later runs read them
 * back as the cooldown, so no extra table or KV is needed.
 */

/** No Telegram post on a channel for this long is an alert. */
export const TELEGRAM_QUIET_MS = 8 * 3600 * 1000;
/** Local audience hours [start, end) when a quiet channel is unexpected. */
export const ACTIVE_HOUR_START = 9;
export const ACTIVE_HOUR_END = 23;
/** LLM attempt failure rate in one run above which we alert. */
export const LLM_FAILURE_RATE = 0.5;
/** Below this many attempts the rate is noise. */
export const LLM_MIN_CALLS = 4;
/** TL;DR failed this many runs in a row (this run included). */
export const TLDR_FAIL_STREAK = 3;
/** The same alert key does not fire again within this window. */
export const ALERT_COOLDOWN_MS = 6 * 3600 * 1000;
/** Previous runs read for the TL;DR streak and the cooldown. */
const HISTORY_RUNS = 12;

const FAILURE_RE = /\b(fail(ed|ure|s)?|errors?)\b/i;
/** Steps with their own rule, or bookkeeping, excluded from "step failed". */
const STEP_CHECK_SKIP = new Set(["tldr", "close-run"]);

export interface HealthIssue {
  key: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export interface PriorRun {
  startedAtMs: number | null;
  steps: RunStepInfo[];
  alerts: string[];
}

export interface HealthInput {
  nowMs: number;
  /** Local audience hour (0-23). */
  localHour: number;
  steps: RunStepInfo[];
  /** Newest successful post per Telegram channel, epoch ms. */
  telegramLastPostMs: Record<string, number>;
  llm: { total: number; failed: number };
  /** Previous runs, newest first, excluding this one. */
  history: PriorRun[];
}

function tldrFailed(steps: RunStepInfo[]): boolean | null {
  const tldr = steps.find((s) => s.name === "tldr");
  if (!tldr) return null;
  return FAILURE_RE.test(tldr.action) || FAILURE_RE.test(tldr.reason ?? "");
}

/** Pure threshold evaluation. Order is stable so tests can assert keys. */
export function evaluateHealth(input: HealthInput): HealthIssue[] {
  const issues: HealthIssue[] = [];

  // A thrown run is already reported by `reportPipelineException`; only
  // the steps that fail quietly (the run still "succeeds") are checked here.
  const failedSteps = input.steps.filter(
    (s) => !STEP_CHECK_SKIP.has(s.name) && hasFailedStep({ steps: [s] })
  );
  if (failedSteps.length > 0) {
    issues.push({
      key: "step-failed",
      severity: "warning",
      title: "Pipeline step failed",
      detail: failedSteps
        .map((s) => `${s.name}: ${s.action}${s.reason ? ` (${s.reason})` : ""}`)
        .join("; "),
    });
  }

  const { total, failed } = input.llm;
  if (total >= LLM_MIN_CALLS && failed / total > LLM_FAILURE_RATE) {
    issues.push({
      key: "llm-failure-rate",
      severity: "error",
      title: "LLM calls failing",
      detail: `${failed}/${total} LLM attempts failed this run`,
    });
  }

  if (tldrFailed(input.steps)) {
    let streak = 1;
    for (const run of input.history) {
      if (tldrFailed(run.steps) !== true) break;
      streak++;
    }
    if (streak >= TLDR_FAIL_STREAK) {
      issues.push({
        key: "tldr-failing",
        severity: "error",
        title: "TL;DR failing",
        detail: `TL;DR failed ${streak} runs in a row`,
      });
    }
  }

  const active =
    input.localHour >= ACTIVE_HOUR_START && input.localHour < ACTIVE_HOUR_END;
  if (active) {
    for (const [channel, last] of Object.entries(input.telegramLastPostMs)) {
      const quietMs = input.nowMs - last;
      if (quietMs <= TELEGRAM_QUIET_MS) continue;
      issues.push({
        key: `telegram-quiet:${channel}`,
        severity: "warning",
        title: "Telegram channel quiet",
        detail: `${channel}: no post for ${Math.floor(quietMs / 3600000)}h`,
      });
    }
  }

  return issues;
}

/** Drop issues whose key already fired within the cooldown window. */
export function applyCooldown(
  issues: HealthIssue[],
  history: PriorRun[],
  nowMs: number
): HealthIssue[] {
  const recent = new Set<string>();
  for (const run of history) {
    if (run.startedAtMs === null) continue;
    if (nowMs - run.startedAtMs >= ALERT_COOLDOWN_MS) continue;
    for (const key of run.alerts) recent.add(key);
  }
  return issues.filter((issue) => !recent.has(issue.key));
}

export function healthAlertEvent(issue: HealthIssue, nowMs: number) {
  return {
    severity: issue.severity,
    source: "aidr.health",
    title: issue.title,
    summary: issue.detail,
    timestamp: nowMs,
  } satisfies AlertEvent;
}

function toMs(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v > 1e12 ? v : v * 1000;
}

export function parsePriorRun(row: {
  started_at?: unknown;
  stats?: unknown;
}): PriorRun {
  let stats: { steps?: unknown; alerts?: unknown } = {};
  if (typeof row.stats === "string") {
    try {
      const parsed = JSON.parse(row.stats) as unknown;
      if (parsed && typeof parsed === "object") stats = parsed as typeof stats;
    } catch {
      // unreadable stats: treat as empty
    }
  }
  const steps = Array.isArray(stats.steps)
    ? (stats.steps as unknown[]).filter(
        (s): s is RunStepInfo =>
          !!s &&
          typeof s === "object" &&
          typeof (s as RunStepInfo).name === "string" &&
          typeof (s as RunStepInfo).action === "string"
      )
    : [];
  const alerts = Array.isArray(stats.alerts)
    ? (stats.alerts as unknown[]).filter(
        (a): a is string => typeof a === "string"
      )
    : [];
  return { startedAtMs: toMs(row.started_at), steps, alerts };
}

async function readHistory(env: Env, runId: string): Promise<PriorRun[]> {
  const { results } = await env.DB.prepare(
    `SELECT started_at, stats FROM workflow_runs WHERE id != ? ORDER BY ${WORKFLOW_RUN_STARTED_AT_ORDER_SQL} DESC, id DESC LIMIT ?`
  )
    .bind(runId, HISTORY_RUNS)
    .all<{ started_at: unknown; stats: unknown }>();
  return (results ?? []).map(parsePriorRun);
}

async function readTelegramLastPost(
  env: Env
): Promise<Record<string, number>> {
  const { results } = await env.DB.prepare(
    `SELECT channel, MAX(posted_at) AS last FROM notifications
     WHERE channel LIKE 'telegram%' AND status = 'sent' GROUP BY channel`
  ).all<{ channel: string; last: number | null }>();
  const last: Record<string, number> = {};
  for (const row of results ?? []) {
    const ms = toMs(row.last);
    if (ms !== null) last[row.channel] = ms;
  }
  return last;
}

async function readLlmCounts(
  env: Env,
  runId: string
): Promise<{ total: number; failed: number }> {
  await flushLlmCallWrites();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed FROM llm_calls WHERE run_id = ?"
  )
    .bind(runId)
    .first<{ total: number | null; failed: number | null }>();
  return { total: row?.total ?? 0, failed: row?.failed ?? 0 };
}

/**
 * Gather inputs, evaluate, report new issues, and return every issue key
 * that fired this run (to persist as `stats.alerts`). Never throws.
 */
export async function runHealthCheck(
  env: Env,
  input: { runId: string; steps: RunStepInfo[] }
): Promise<string[]> {
  try {
    const nowMs = Date.now();
    const [history, telegramLastPostMs, llm] = await Promise.all([
      readHistory(env, input.runId),
      readTelegramLastPost(env),
      readLlmCounts(env, input.runId),
    ]);
    const issues = evaluateHealth({
      nowMs,
      localHour: getLocalHourAndDate(nowMs, AUDIENCE_TIMEZONE).hour,
      steps: input.steps,
      telegramLastPostMs,
      llm,
      history,
    });
    const fresh = applyCooldown(issues, history, nowMs);
    await Promise.all(
      fresh.map((issue) =>
        reportHealthAlert(env, healthAlertEvent(issue, nowMs), issue.key)
      )
    );
    return fresh.map((issue) => issue.key);
  } catch (error) {
    console.error("health-check failed:", error);
    return [];
  }
}
