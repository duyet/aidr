import type { SourceRunHealth } from "./source-health.js";
import { emptySourceHealth } from "./source-health.js";
import { sanitizeRunStats } from "./telemetry-safe.js";

/**
 * Per-run telemetry persisted as a single JSON column on `workflow_runs`
 * (see migrations/0012_run_stats.sql), so the admin /system dashboard can
 * show a richer breakdown than the existing items_fetched/items_new/error
 * columns without another ALTER TABLE every time a new metric is wanted.
 */

/** One step's self-reported explanation of what it did (or didn't do) and
 * why, e.g. `{ name: "dedupe", action: "0 new", reason: "27 already in db" }`.
 * Recorded best-effort by the workflow — see `recordStep` below. */
export interface RunStepInfo {
  name: string;
  action: string;
  reason?: string;
}

export interface RunStats {
  /** Items fetched this run, per source id. */
  bySource: Record<string, number>;
  /**
   * Full per-source outcome for this run — fetch / score / accept / reject /
   * merge counts, a structured skip reason, and the consecutive-empty-run
   * streak that drives the stale detector. `bySource` above is kept as the
   * cheap "how much did each source pull" field; this is the one that answers
   * "is this source earning its slot?". See `worker/source-health.ts`.
   *
   * Absent (not `{}`) on pre-#230 runs so a missing column reads as "this run
   * predates per-source health" rather than "every source produced nothing".
   */
  sourceHealth?: Record<string, SourceRunHealth>;
  /** Per-step summary of what happened and why, in run order. */
  steps: RunStepInfo[];
  new: number;
  merged: number;
  rejected: number;
  published: number;
  /** Total LLM tokens burned across every step this run (scoring,
   *  translation, backfill, QA, suggestion/submission review, TL;DR). */
  tokens: number;
  backfilledSummaries: number;
  backfilledTranslations: number;
  qaRated: number;
  qaAdjusted: number;
  suggestionsReviewed: number;
  submissionsReviewed: number;
  tldrGenerated: boolean;
  emailsSent: number;
  /** Stories delivered per notification channel (telegram, discord, ...). */
  notified: Record<string, number>;
  /** Structured digest/trending skip reasons per channel. */
  notifyReason: Record<string, unknown>;
  /** Health-check alert keys raised this run; later runs read them back as
   *  the alert cooldown (see `worker/health.ts`). Absent when none fired. */
  alerts?: string[];
}

/** Every field defaults to zero/false/empty so a missing or failed step
 * never leaves `undefined` in the persisted JSON. */
export function buildRunStats(partial: Partial<RunStats> = {}): RunStats {
  return {
    bySource: partial.bySource ?? {},
    // Only present when the run actually produced a per-source record (the
    // open-run upsert passes none, so a run that has not reached its fetch
    // step does not claim zero health for every source).
    ...(partial.sourceHealth ? { sourceHealth: partial.sourceHealth } : {}),
    steps: partial.steps ?? [],
    new: partial.new ?? 0,
    merged: partial.merged ?? 0,
    rejected: partial.rejected ?? 0,
    published: partial.published ?? 0,
    tokens: partial.tokens ?? 0,
    backfilledSummaries: partial.backfilledSummaries ?? 0,
    backfilledTranslations: partial.backfilledTranslations ?? 0,
    qaRated: partial.qaRated ?? 0,
    qaAdjusted: partial.qaAdjusted ?? 0,
    suggestionsReviewed: partial.suggestionsReviewed ?? 0,
    submissionsReviewed: partial.submissionsReviewed ?? 0,
    tldrGenerated: partial.tldrGenerated ?? false,
    emailsSent: partial.emailsSent ?? 0,
    notified: partial.notified ?? {},
    notifyReason: partial.notifyReason ?? {},
    ...(partial.alerts?.length ? { alerts: partial.alerts } : {}),
  };
}

export function serializeRunStats(stats: RunStats): string {
  return JSON.stringify(sanitizeRunStats(stats));
}

/** Appends a step explanation to `steps`, swallowing any error so a bug in
 * self-reporting (e.g. a non-serializable reason) never fails the run. */
export function recordStep(
  steps: RunStepInfo[],
  name: string,
  action: string,
  reason?: string
): void {
  try {
    steps.push({ name, action, reason });
  } catch {
    // never let step-explanation bookkeeping break the run
  }
}

/** Merge one source's outcome into the run's health map, creating the entry
 *  on first sight. Pure and total: it is called from ordinary code between
 *  Workflow steps (which replay by returning their memoized value, not by
 *  re-running), so it must be deterministic and must never throw. */
export function recordSourceHealth(
  health: Record<string, SourceRunHealth>,
  sourceId: string,
  patch: Partial<SourceRunHealth>
): SourceRunHealth {
  const current = health[sourceId] ?? emptySourceHealth();
  const next: SourceRunHealth = { ...current, ...patch };
  health[sourceId] = next;
  return next;
}
