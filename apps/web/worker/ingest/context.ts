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
 * past the next GitHub POST, so later runs never reached record-run. */
export const BACKFILL_TRANSLATE_STEP = {
  retries: { limit: 0, delay: 0 },
  timeout: "2 minutes",
} as const;

/** Score / translate / merge / TL;DR / backfill-score. Same retry trap as
 * backfill-translate: a timed-out or exhausted LLM step must not retry for
 * ~50 minutes, or `record-run` never writes `workflow_runs`. */
export const LLM_STEP = {
  retries: { limit: 0, delay: 0 },
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
