import type { WorkflowStep } from "cloudflare:workers";
import type { RunStepInfo } from "../run-stats.js";
import type { FetchedItem } from "../sources/types.js";
import type { Env } from "../types.js";
import type { IngestMode } from "./mode.js";

/** What every ingest step needs: the Workflow step API, the Worker env, this
 * run's id (for LLM-call attribution), the per-run step log that ends up
 * in `workflow_runs.stats`, and the run's mode (dry run / selected steps). */
export interface IngestContext {
  step: WorkflowStep;
  env: Env;
  runId: string;
  steps: RunStepInfo[];
  mode: IngestMode;
}

/** Below this LLM relevance a new item is stored as `rejected`, not shown. */
export const RELEVANCE_THRESHOLD = 0.4;
export const RANK_RECOMPUTE_WINDOW_SEC = 72 * 60 * 60;
export const SINCE_WINDOW_SEC = 26 * 60 * 60; // slight overlap over the hourly cron
// Same lookback the rank-recompute step uses: candidates for "same story as
// an already-published item" clustering.
export const MERGE_LOOKBACK_SEC = RANK_RECOMPUTE_WINDOW_SEC;
// Bounds the clustering prompt's size; recent+highest-ranked first.
export const MERGE_CANDIDATE_LIMIT = 300;

/** Backfill-translate slices already catch LLM failures. Default Workflow
 * retries (5 × 10 min) stacked 15 slices and left ingest instances running
 * past the next GitHub POST, so later runs never reached record-run.
 * The timeout sits above `TRANSLATE_TIMEOUT_MS` so a slow model can return
 * and the D1 upserts after `translateItems` still run. At 2 minutes the
 * engine killed the slice before that deadline (one batch plus a repair
 * pass already exceeds 2 minutes). */
export const BACKFILL_TRANSLATE_STEP = {
  retries: { limit: 0, delay: 0 },
  timeout: "5 minutes",
} as const;

/** Score / translate / merge / backfill-score. Same retry trap as
 * backfill-translate: a timed-out or exhausted LLM step must not retry for
 * ~50 minutes, or `record-run` never writes `workflow_runs`. Translate
 * slices call `translateItems`, whose deadline is `TRANSLATE_TIMEOUT_MS`
 * (4 minutes). A step timeout equal to that deadline leaves no time for the
 * D1 writes after it returns, so the engine can kill the step as the call
 * is finishing. */
export const LLM_STEP = {
  retries: { limit: 0, delay: 0 },
  timeout: "5 minutes",
} as const;

/** TL;DR step. `ensureDailyTldr` catches its own LLM/D1 errors, so the
 * only way this step fails is the engine itself: a deploy resetting the
 * Workflow Durable Object ("Durable Object reset because its code was
 * updated") or an internal engine fault. With no retry the engine stores
 * that failure and every replay returns it, so the edition is not
 * refreshed that run (run 1ca7319a, 2026-10-01). One short retry re-runs
 * it; the snapshot upsert is idempotent. */
export const TLDR_STEP = {
  retries: { limit: 1, delay: 10_000 },
  timeout: "4 minutes",
} as const;

export interface SourceRow {
  id: string;
  type: string;
  config: string;
  enabled: number;
}

/** A candidate item for this run: fetched and not yet in D1, or a row that
 * was inserted with `status = 'new'` outside the fetch loop. */
export interface NewRow {
  id: string;
  source: SourceRow;
  item: FetchedItem;
}
