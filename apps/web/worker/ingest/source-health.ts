import type { MergePlan } from "../dedupe.js";
import {
  carrySourceEmptyRuns,
  emptySourceHealth,
  parsePreviousEmptyRuns,
  resolveSkipReason,
  type SourceRunHealth,
} from "../source-health.js";
import {
  NOT_DRY_RUN_SQL,
  WORKFLOW_RUN_STARTED_AT_ORDER_SQL,
} from "../workflow-run.js";
import { safeStep } from "../workflow-step.js";
import type { IngestContext, NewRow } from "./context.js";
import type { FetchFailureReason } from "./fetch.js";

/**
 * Per-source accepted / rejected / merged, using exactly the same partition
 * the write step applies (`publishedRows` already excludes merged rows, and
 * `rejected` is the remainder). `rejected` here is precisely the
 * `relevance < 0.4` hide rule firing — the rule itself is untouched; this only
 * makes it countable per source so a source that fetches a lot and publishes
 * nothing is visible.
 */
export function tallySourceOutcomes(
  sourceHealth: Record<string, SourceRunHealth>,
  newRows: readonly NewRow[],
  publishedRows: readonly NewRow[],
  mergePlan: MergePlan
): void {
  // A Set because `publishedRows.includes` would make this bookkeeping
  // O(n²) and the run should not get slower for observability.
  const publishedRowIds = new Set(publishedRows.map((row) => row.id));
  for (const row of newRows) {
    const health = sourceHealth[row.source.id];
    if (!health) continue;
    if (mergePlan.merged.has(row.id)) health.merged += 1;
    else if (publishedRowIds.has(row.id)) health.accepted += 1;
    else health.rejected += 1;
  }
}

/** Resolve the structured skip reason for every enabled source. A source
 * that delivered items has no reason; one that delivered none gets the
 * single most specific explanation the run actually has evidence for. */
export function resolveSkipReasons(
  sourceHealth: Record<string, SourceRunHealth>,
  fetchFailures: ReadonlyMap<string, FetchFailureReason>
): void {
  for (const [id, health] of Object.entries(sourceHealth)) {
    if (health.skipReason === "disabled") continue;
    health.skipReason = resolveSkipReason({
      failure: fetchFailures.get(id),
      fetched: health.fetched,
      newItems: health.accepted + health.rejected + health.merged,
      rejected: health.rejected,
    });
  }
}

/** The previous run stored full per-source records; only the `emptyRuns`
 * streak is carried forward, so rehydrate just that field rather than
 * trusting the rest of a JSON column written by an older build. */
export function previousHealthFromStreaks(
  previousEmptyRuns: Record<string, number>
): Record<string, SourceRunHealth> {
  return Object.fromEntries(
    Object.entries(previousEmptyRuns).map(([id, emptyRuns]) => [
      id,
      { ...emptySourceHealth(), emptyRuns },
    ])
  );
}

/**
 * Carry the empty-run streaks forward from the previous run's stats instead
 * of scanning run history, so surfacing "stale" on the read path stays a
 * single-row read no matter how long a feed has been dead. Inside a step so
 * a Workflow replay returns the memoized result rather than incrementing the
 * same streak twice.
 */
export async function carrySourceStreaks(
  ctx: IngestContext,
  sourceHealth: Record<string, SourceRunHealth>
): Promise<void> {
  const { step, env, runId } = ctx;
  const previousEmptyRuns = await safeStep(
    step,
    "carry-source-streaks",
    {} as Record<string, number>,
    async () => {
      const { results } = await env.DB.prepare(
        `SELECT stats FROM workflow_runs
             WHERE id != ? AND stats IS NOT NULL AND stats LIKE '%"sourceHealth"%'
               AND ${NOT_DRY_RUN_SQL}
             ORDER BY ${WORKFLOW_RUN_STARTED_AT_ORDER_SQL} DESC, id DESC
             LIMIT 1`
      )
        .bind(runId)
        .all<{ stats: string | null }>();
      return parsePreviousEmptyRuns(results?.[0]?.stats ?? null);
    }
  );
  Object.assign(
    sourceHealth,
    carrySourceEmptyRuns(
      sourceHealth,
      previousHealthFromStreaks(previousEmptyRuns)
    )
  );
}
