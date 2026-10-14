import { hasFailedStep } from "../src/lib/run-health.js";
import { reportHealthAlert } from "./bugsink.js";
import {
  checkDayVideo,
  DAY_VIDEO_CONFIRMED_PREFIX,
  dayVideoConfirmedKey,
  shouldCheckDayVideo,
} from "./day-video-watchdog.js";
import { NOT_SELECTED_REASON } from "./ingest/mode.js";
import { flushLlmCallWrites } from "./llm-call-log.js";
import type { AlertEvent, AlertSeverity } from "./notify/alert.js";
import {
  type DailySummary,
  dailySummaryKey,
  formatDailySummary,
  type ModelStat,
  notifyOwner,
  sendOwnerDm,
  shouldSendDailySummary,
} from "./owner-alerts.js";
import type { RunStepInfo } from "./run-stats.js";
import { getLocalHourAndDate } from "./subscribe/send.js";
import { AUDIENCE_TIMEZONE, isActiveHour } from "./time.js";
import type { Env } from "./types.js";
import {
  NOT_DRY_RUN_SQL,
  WORKFLOW_RUN_STARTED_AT_ORDER_SQL,
} from "./workflow-run.js";

/**
 * In-pipeline health check, run once at close-run. Each hourly run looks at
 * its own steps and LLM calls plus recent history, and raises an alert
 * through the Sentry/Bugsink path when the pipeline is quietly broken
 * (e.g. Telegram silent for hours while every run "succeeds").
 *
 * Alert keys are written to the run's `stats.alerts`; later runs read them
 * back as the cooldown, so no extra table or KV is needed.
 */

/** No Telegram post on a channel for this long is an alert. The daily
 *  digest is the only post every day is sure to have (trending needs an
 *  exceptional story), so a fault is "more than a day", with slack for a
 *  late digest. A shorter window fired on normal days. */
export const TELEGRAM_QUIET_MS = 26 * 3600 * 1000;
/** LLM attempt failure rate in one run above which we alert. */
export const LLM_FAILURE_RATE = 0.5;
/** Provider 429s in one run at which the owner is told the quota is spent. */
export const LLM_RATE_LIMIT_BURST = 5;
/** Alert key for a 429 burst. Starts with `llm`, so it routes to the router repo. */
export const LLM_RATE_LIMITED_KEY = "llm-rate-limited";
/** Non-429 attempts of one task, all failed, at which its chain is down. */
export const LLM_TASK_FAILING_MIN_ATTEMPTS = 3;
/** Per-task key, so each task keeps its own cooldown. Starts with `llm`. */
export function llmTaskFailingKey(task: string): string {
  return `llm-task-failing:${task}`;
}
/** Below this many attempts the rate is noise. */
export const LLM_MIN_CALLS = 4;
/** TL;DR failed this many runs in a row (this run included). */
export const TLDR_FAIL_STREAK = 3;
/** The same alert key does not fire again within this window. */
export const ALERT_COOLDOWN_MS = 6 * 3600 * 1000;
/** Previous runs read for the TL;DR streak and the cooldown. */
const HISTORY_RUNS = 12;
/** `stats.alerts` keys that record a finished check, not a problem. */
const MARKER_PREFIXES = ["daily-summary:", DAY_VIDEO_CONFIRMED_PREFIX];

const FAILURE_RE = /\b(fail(ed|ure|s)?|errors?)\b/i;
/** Steps with their own rule, or bookkeeping, excluded from "step failed". */
const STEP_CHECK_SKIP = new Set(["tldr", "close-run"]);

export interface HealthIssue {
  key: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** Lines for the owner DM and the issue body, when the check has them. */
  evidence?: string[];
  /** The models an LLM issue is about. Its GitHub fingerprint and evidence
   * use these instead of every model the run called. */
  models?: ModelStat[];
}

export interface PriorRun {
  startedAtMs: number | null;
  steps: RunStepInfo[];
  alerts: string[];
}

export interface LlmTaskCount {
  task: string;
  total: number;
  ok: number;
  rateLimited: number;
  /** This task's attempts per model this run. */
  models: ModelStat[];
}

export interface HealthInput {
  nowMs: number;
  /** Local audience hour (0-23). */
  localHour: number;
  steps: RunStepInfo[];
  /** Newest successful post per Telegram channel, epoch ms. */
  telegramLastPostMs: Record<string, number>;
  llm: {
    total: number;
    failed: number;
    rateLimited: number;
    tasks: LlmTaskCount[];
  };
  /** Previous runs, newest first, excluding this one. */
  history: PriorRun[];
}

function tldrFailed(steps: RunStepInfo[]): boolean | null {
  const tldr = steps.find((s) => s.name === "tldr");
  // A partial rerun that left tldr out says nothing about the streak.
  if (!tldr || tldr.reason === NOT_SELECTED_REASON) return null;
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

  if (input.llm.rateLimited >= LLM_RATE_LIMIT_BURST) {
    issues.push({
      key: LLM_RATE_LIMITED_KEY,
      severity: "error",
      title: "LLM quota exhausted (HTTP 429)",
      detail: `${input.llm.rateLimited} LLM calls got HTTP 429 this run; new stories stay unscored and untranslated until the quota window resets`,
    });
  }

  for (const t of input.llm.tasks) {
    // 429s belong to the quota alert above; counting them here would page
    // once per task for the same spent quota.
    const attempts = t.total - t.rateLimited;
    if (t.ok > 0 || attempts < LLM_TASK_FAILING_MIN_ATTEMPTS) continue;
    issues.push({
      key: llmTaskFailingKey(t.task),
      severity: "error",
      title: `LLM ${t.task} chain down`,
      detail: `All ${attempts} ${t.task} attempts failed this run (${t.models.map((m) => m.model).join(", ")})`,
      models: t.models,
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

  if (isActiveHour(input.localHour)) {
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
    `SELECT started_at, stats FROM workflow_runs WHERE id != ? AND ${NOT_DRY_RUN_SQL} ORDER BY ${WORKFLOW_RUN_STARTED_AT_ORDER_SQL} DESC, id DESC LIMIT ?`
  )
    .bind(runId, HISTORY_RUNS)
    .all<{ started_at: unknown; stats: unknown }>();
  return (results ?? []).map(parsePriorRun);
}

async function readTelegramLastPost(env: Env): Promise<Record<string, number>> {
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

interface ModelStatRow {
  model: string;
  ok: number;
  status: number | null;
  n: number;
}

/** Folds (model, ok, status) counts into per-model stats, busiest first. */
function foldModelStats(rows: ModelStatRow[]): ModelStat[] {
  const byModel = new Map<string, ModelStat>();
  for (const row of rows) {
    const m = byModel.get(row.model) ?? {
      model: row.model,
      total: 0,
      failed: 0,
      statuses: {},
    };
    m.total += row.n;
    if (!row.ok) {
      m.failed += row.n;
      const status = row.status === null ? "error" : String(row.status);
      m.statuses[status] = (m.statuses[status] ?? 0) + row.n;
    }
    byModel.set(row.model, m);
  }
  return [...byModel.values()].sort((a, b) => b.total - a.total);
}

/** Per-task counts for this run; the run totals are their sums. */
async function readLlmCounts(
  env: Env,
  runId: string
): Promise<HealthInput["llm"]> {
  await flushLlmCallWrites();
  const { results } = await env.DB.prepare(
    `SELECT task, model, ok, error_status AS status, COUNT(*) AS n
     FROM llm_calls WHERE run_id = ? GROUP BY task, model, ok, error_status`
  )
    .bind(runId)
    .all<ModelStatRow & { task: string }>();
  const rowsByTask = new Map<string, ModelStatRow[]>();
  for (const row of results ?? []) {
    const rows = rowsByTask.get(row.task) ?? [];
    rows.push(row);
    rowsByTask.set(row.task, rows);
  }
  const tasks: LlmTaskCount[] = [...rowsByTask].map(([task, rows]) => {
    const models = foldModelStats(rows);
    const total = models.reduce((n, m) => n + m.total, 0);
    return {
      task,
      total,
      ok: total - models.reduce((n, m) => n + m.failed, 0),
      rateLimited: models.reduce((n, m) => n + (m.statuses["429"] ?? 0), 0),
      models,
    };
  });
  const sum = (pick: (t: LlmTaskCount) => number) =>
    tasks.reduce((n, t) => n + pick(t), 0);
  const total = sum((t) => t.total);
  return {
    total,
    failed: total - sum((t) => t.ok),
    rateLimited: sum((t) => t.rateLimited),
    tasks,
  };
}

async function readModelStats(
  env: Env,
  where: string,
  bind: unknown
): Promise<ModelStat[]> {
  const { results } = await env.DB.prepare(
    `SELECT model, ok, error_status AS status, COUNT(*) AS n FROM llm_calls
     WHERE ${where} GROUP BY model, ok, error_status`
  )
    .bind(bind)
    .all<ModelStatRow>();
  return foldModelStats(results ?? []);
}

async function readDailySummary(
  env: Env,
  nowMs: number,
  date: string
): Promise<DailySummary> {
  const sinceMs = nowMs - 24 * 3600 * 1000;
  const [runs, posts, models] = await Promise.all([
    env.DB.prepare(
      "SELECT error, items_new, stats FROM workflow_runs WHERE started_at >= ?"
    )
      .bind(Math.floor(sinceMs / 1000))
      .all<{
        error: string | null;
        items_new: number | null;
        stats: unknown;
      }>(),
    env.DB.prepare(
      `SELECT channel, COUNT(*) AS n FROM notifications
       WHERE channel LIKE 'telegram%' AND status = 'sent' AND posted_at >= ?
       GROUP BY channel`
    )
      .bind(sinceMs)
      .all<{ channel: string; n: number }>(),
    readModelStats(env, "ts >= ?", sinceMs),
  ]);
  const summary: DailySummary = {
    date,
    runsOk: 0,
    runsFailed: 0,
    itemsNew: 0,
    telegramPosts: {},
    models,
    warnings: {},
  };
  for (const run of runs.results ?? []) {
    if (run.error) summary.runsFailed++;
    else summary.runsOk++;
    summary.itemsNew += run.items_new ?? 0;
    for (const key of parsePriorRun(run).alerts) {
      if (MARKER_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
      summary.warnings[key] = (summary.warnings[key] ?? 0) + 1;
    }
  }
  for (const row of posts.results ?? []) {
    summary.telegramPosts[row.channel] = row.n;
  }
  return summary;
}

/** Once-per-day owner DM. Returns the key to record, or null. */
async function maybeSendDailySummary(
  env: Env,
  nowMs: number,
  history: PriorRun[]
): Promise<string | null> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_OWNER_CHAT_ID) return null;
  const { hour, date } = getLocalHourAndDate(nowMs, AUDIENCE_TIMEZONE);
  if (!shouldSendDailySummary(hour, date, history)) return null;
  try {
    const summary = await readDailySummary(env, nowMs, date);
    // A rejected DM (bot not started, wrong chat id) would be rejected and
    // reported again on every run of the window, so it also uses up the day.
    const outcome = await sendOwnerDm(env, formatDailySummary(summary));
    return outcome === "failed" ? null : dailySummaryKey(date);
  } catch (error) {
    console.error("daily summary failed:", error);
    return null;
  }
}

/**
 * Gather inputs, evaluate, report new issues, and return every issue key
 * that fired this run (to persist as `stats.alerts`). Never throws.
 */
export async function runHealthCheck(
  env: Env,
  input: { runId: string; steps: RunStepInfo[]; dryRun?: boolean }
): Promise<string[]> {
  // A dry run skips email/notify on purpose and must never page the owner
  // (Bugsink, Telegram DM, GitHub issue, daily summary) about it.
  if (input.dryRun) return [];
  try {
    const nowMs = Date.now();
    const [history, telegramLastPostMs, llm] = await Promise.all([
      readHistory(env, input.runId),
      readTelegramLastPost(env),
      readLlmCounts(env, input.runId),
    ]);
    const local = getLocalHourAndDate(nowMs, AUDIENCE_TIMEZONE);
    const issues = evaluateHealth({
      nowMs,
      localHour: local.hour,
      steps: input.steps,
      telegramLastPostMs,
      llm,
      history,
    });
    const markers: string[] = [];
    if (shouldCheckDayVideo(local.hour, local.date, history, nowMs)) {
      const dayVideo = await checkDayVideo(env, local.date, nowMs);
      if (dayVideo.kind === "alert") issues.push(dayVideo.issue);
      if (dayVideo.kind === "confirmed")
        markers.push(dayVideoConfirmedKey(local.date));
    }
    const fresh = applyCooldown(issues, history, nowMs);
    await Promise.all(
      fresh.map((issue) =>
        reportHealthAlert(env, healthAlertEvent(issue, nowMs), issue.key)
      )
    );
    const keys = [...fresh.map((issue) => issue.key), ...markers];
    if (
      fresh.length > 0 &&
      (env.TELEGRAM_OWNER_CHAT_ID || env.GITHUB_ALERT_TOKEN)
    ) {
      const models = await readModelStats(env, "run_id = ?", input.runId);
      const telegramQuietHours: Record<string, number> = {};
      for (const [channel, last] of Object.entries(telegramLastPostMs)) {
        telegramQuietHours[channel] = Math.floor((nowMs - last) / 3600000);
      }
      await notifyOwner(env, fresh, {
        runId: input.runId,
        nowMs,
        models,
        telegramQuietHours,
      });
    }
    const summaryKey = await maybeSendDailySummary(env, nowMs, history);
    if (summaryKey) keys.push(summaryKey);
    return keys;
  } catch (error) {
    console.error("health-check failed:", error);
    return [];
  }
}
