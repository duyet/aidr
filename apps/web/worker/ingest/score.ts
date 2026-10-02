import { scoreItems } from "../llm.js";
import { recordStep } from "../run-stats.js";
import type { SourceRunHealth } from "../source-health.js";
import { jsonMap, mapEntries } from "../workflow-run.js";
import { llmStep } from "../workflow-step.js";
import { type IngestContext, LLM_STEP, type NewRow } from "./context.js";

export type ItemScore = Awaited<ReturnType<typeof scoreItems>>[number];

/** Maps batch results (keyed by position `i`) back to item ids. A result
 * whose index has no row is dropped rather than attributed to the wrong
 * item. */
export function keyResultsById<R extends { i: number }>(
  rows: readonly { id: string }[],
  results: readonly R[]
): Map<string, R> {
  const map = new Map<string, R>();
  for (const result of results) {
    const row = rows[result.i];
    if (row) map.set(row.id, result);
  }
  return map;
}

/** Per-source `scored` counts. `newRows` is what the scorer was actually
 * handed (post-dedupe), so this is the honest denominator for "how much of
 * what this source delivered cost us an LLM call". */
export function tallyScored(
  sourceHealth: Record<string, SourceRunHealth>,
  newRows: readonly NewRow[],
  scored: ReadonlyMap<string, unknown>
): void {
  for (const row of newRows) {
    if (!scored.has(row.id)) continue;
    const health = sourceHealth[row.source.id];
    if (health) health.scored += 1;
  }
}

export async function scoreNewRows(
  ctx: IngestContext,
  newRows: readonly NewRow[]
): Promise<Map<string, ItemScore>> {
  const { step, env, runId, steps } = ctx;
  const scored = jsonMap(
    await llmStep(
      step,
      env,
      runId,
      "score",
      [] as [string, ItemScore][],
      async () => {
        if (newRows.length === 0) return [];
        try {
          const results = await scoreItems(
            env,
            newRows.map((row, i) => ({
              i,
              // Decision identity: lets the optional JEV panel key its
              // idempotency to this item inside this run.
              id: row.id,
              title: row.item.title,
              summary: row.item.summary,
              source: row.source.id,
            }))
          );
          return mapEntries(keyResultsById(newRows, results));
        } catch (error) {
          console.error("score step failed:", error);
          return [];
        }
      },
      { config: LLM_STEP }
    )
  );
  recordStep(
    steps,
    "score",
    newRows.length === 0 ? "skipped" : `scored ${scored.size} items`,
    newRows.length === 0 ? "no new items" : undefined
  );
  return scored;
}
