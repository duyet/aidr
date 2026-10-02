/**
 * How one ingest run was asked to behave: a dry run (no email, Telegram or
 * owner alert leaves the Worker, and the TL;DR is only previewed), and/or a
 * subset of pipeline steps. Carried on the Workflow `create({ params })`
 * payload. Kept free of `cloudflare:workers` so the admin trigger, the local
 * agent CLI and node tests share one definition.
 */
// Type-only, so the MCP tool registry can import the step names with no
// runtime graph behind them.
import type { RunStepInfo } from "../run-stats.js";

/** Selectable step names, in pipeline order. They match the `recordStep`
 * names on the runs dashboard, plus `write` for the D1 write + re-rank. */
export const PIPELINE_STEPS = [
  "fetch",
  "dedupe",
  "score",
  "translate",
  "write",
  "backfill-content",
  "backfill-translate",
  "backfill-score",
  "qa-translations",
  "inbound-email",
  "review-suggestions",
  "review-submissions",
  "tldr",
  "email",
  "notify",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

/** The fresh-item chain: each step consumes the previous step's output, so a
 * chain step only runs when every earlier chain step runs too. */
export const FRESH_ITEM_CHAIN: readonly PipelineStep[] = [
  "fetch",
  "dedupe",
  "score",
  "translate",
  "write",
];

export const DRY_RUN_SKIP_REASON = "dry run: no email or telegram";
export const NOT_SELECTED_REASON = "not selected";

export interface IngestMode {
  dryRun: boolean;
  /** null = every step. */
  steps: PipelineStep[] | null;
}

export const LIVE_FULL_RUN: IngestMode = { dryRun: false, steps: null };

const STEP_SET = new Set<string>(PIPELINE_STEPS);

export function isPipelineStep(value: unknown): value is PipelineStep {
  return typeof value === "string" && STEP_SET.has(value);
}

export type ParsedIngestMode =
  | { ok: true; mode: IngestMode }
  | { ok: false; error: string };

/** Strict validation for the admin trigger: unknown keys' values are
 * ignored, but a wrong type or an unknown step name is an error so a typo
 * never silently becomes "run everything". */
export function validateIngestMode(input: {
  dryRun?: unknown;
  steps?: unknown;
}): ParsedIngestMode {
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") {
    return { ok: false, error: "dryRun must be a boolean" };
  }
  let steps: PipelineStep[] | null = null;
  if (input.steps !== undefined && input.steps !== null) {
    const requested: unknown = input.steps;
    if (!Array.isArray(requested) || requested.length === 0) {
      return { ok: false, error: "steps must be a non-empty array" };
    }
    const unknown = requested.filter((s) => !isPipelineStep(s));
    if (unknown.length > 0) {
      return {
        ok: false,
        error: `unknown steps: ${unknown.map(String).join(", ")} (valid: ${PIPELINE_STEPS.join(", ")})`,
      };
    }
    steps = PIPELINE_STEPS.filter((s) => requested.includes(s));
  }
  return { ok: true, mode: { dryRun: input.dryRun === true, steps } };
}

/** Lenient read of the Workflow payload: the trigger already validated it,
 * so anything malformed here (an old instance, a hand-made create) falls
 * back to a normal run and unknown step names are dropped. A payload that
 * asks for a dry run always stays a dry run. */
export function ingestModeFromPayload(payload: unknown): IngestMode {
  if (!payload || typeof payload !== "object") return LIVE_FULL_RUN;
  const record = payload as { dryRun?: unknown; steps?: unknown };
  const dryRun = record.dryRun === true;
  if (!Array.isArray(record.steps)) return { dryRun, steps: null };
  const steps = PIPELINE_STEPS.filter((s) =>
    (record.steps as unknown[]).includes(s)
  );
  return { dryRun, steps };
}

/** The Workflow `create()` params for a mode, or undefined for a normal
 * full live run (which keeps `create({ id })` unchanged). */
export function ingestModePayload(
  mode: IngestMode
): { dryRun?: true; steps?: PipelineStep[] } | undefined {
  if (!mode.dryRun && !mode.steps) return undefined;
  return {
    ...(mode.dryRun ? { dryRun: true as const } : {}),
    ...(mode.steps ? { steps: mode.steps } : {}),
  };
}

/** A run that is not a full live run must not move the hourly schedule. */
export function isScheduledRun(mode: IngestMode): boolean {
  return !mode.dryRun && !mode.steps;
}

/** Why a step will not run, or null when it runs. */
export function stepSkipReason(
  mode: IngestMode,
  name: PipelineStep
): string | null {
  if (!mode.steps) return null;
  if (!mode.steps.includes(name)) return NOT_SELECTED_REASON;
  const at = FRESH_ITEM_CHAIN.indexOf(name);
  if (at > 0) {
    const missing = FRESH_ITEM_CHAIN.slice(0, at).filter(
      (s) => !mode.steps?.includes(s)
    );
    if (missing.length > 0) return `needs ${missing.join(", ")}`;
  }
  return null;
}

/** Run-stats fields that mark a non-default run. Empty for a normal run. */
export function ingestModeStats(mode: IngestMode): {
  mode?: "dry-run";
  selectedSteps?: PipelineStep[];
} {
  return {
    ...(mode.dryRun ? { mode: "dry-run" as const } : {}),
    ...(mode.steps ? { selectedSteps: mode.steps } : {}),
  };
}

/** Records `name` as skipped and returns true when the run's step selection
 * leaves it out; returns false (records nothing) when the step should run. */
export function skipUnselectedStep(
  ctx: { mode: IngestMode; steps: RunStepInfo[] },
  name: PipelineStep
): boolean {
  const reason = stepSkipReason(ctx.mode, name);
  if (reason === null) return false;
  ctx.steps.push({ name, action: "skipped", reason });
  return true;
}

/** `skipUnselectedStep` for a fresh-item chain step. When it is skipped,
 * every later chain step is recorded as skipped too (they never get the
 * rows they would consume), so the run log still lists each one. */
export function runChainStep(
  ctx: { mode: IngestMode; steps: RunStepInfo[] },
  name: PipelineStep
): boolean {
  if (!skipUnselectedStep(ctx, name)) return true;
  const at = FRESH_ITEM_CHAIN.indexOf(name);
  for (const later of FRESH_ITEM_CHAIN.slice(at + 1)) {
    skipUnselectedStep(ctx, later);
  }
  return false;
}
