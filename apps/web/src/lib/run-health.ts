/**
 * Footer pipeline health: a tiny summary of the newest `workflow_runs` row,
 * built server-side by `/api/feed/freshness` and classified client-side
 * against the viewer's clock.
 */
export interface LatestRunSummary {
  id: string;
  /** Epoch seconds. */
  startedAt: number | null;
  /** Epoch seconds; null while the run is still in progress. */
  finishedAt: number | null;
  /** The run recorded a top-level `error`. */
  failed: boolean;
  /** The run finished, but a step reported a failure or error. */
  degraded: boolean;
}

export type RunHealth = "ok" | "degraded" | "down";

/** Hourly pipeline: two hours allows one missed tick before we warn. */
export const RUN_FRESH_SEC = 2 * 3600;
/** Past six hours without a run, the pipeline is treated as down. */
export const RUN_STALE_SEC = 6 * 3600;

const STEP_FAILURE_RE = /\b(fail(ed|ure|s)?|errors?)\b/i;

/** A step whose self-reported action or reason names a failure or error. */
export function hasFailedStep(stats: unknown): boolean {
  if (!stats || typeof stats !== "object") return false;
  const steps = (stats as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return false;
  return steps.some((step) => {
    if (!step || typeof step !== "object") return false;
    const { action, reason } = step as { action?: unknown; reason?: unknown };
    return (
      (typeof action === "string" && STEP_FAILURE_RE.test(action)) ||
      (typeof reason === "string" && STEP_FAILURE_RE.test(reason))
    );
  });
}

export function isLatestRunSummary(value: unknown): value is LatestRunSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const ts = (x: unknown) =>
    x === null || (typeof x === "number" && Number.isFinite(x));
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    ts(v.startedAt) &&
    ts(v.finishedAt) &&
    typeof v.failed === "boolean" &&
    typeof v.degraded === "boolean"
  );
}

/**
 * green `ok`: newest run succeeded within 2h.
 * yellow `degraded`: succeeded but a step failed, or newest run is 2–6h old.
 * red `down`: newest run errored, or no run in over 6h (or none at all).
 */
export function classifyRunHealth(
  run: LatestRunSummary | null,
  nowSec: number
): RunHealth {
  if (!run || run.failed) return "down";
  const at = run.finishedAt ?? run.startedAt;
  if (at === null) return "down";
  const age = nowSec - at;
  if (age > RUN_STALE_SEC) return "down";
  if (run.degraded || age > RUN_FRESH_SEC) return "degraded";
  return "ok";
}

export const RUN_HEALTH_LABEL: Record<RunHealth, string> = {
  ok: "Pipeline healthy: latest run succeeded",
  degraded: "Pipeline degraded: a step failed or data is stale",
  down: "Pipeline down: latest run failed or no recent run",
};

export const RUN_HEALTH_DOT: Record<RunHealth, string> = {
  ok: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
};
