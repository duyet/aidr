import { chunk } from "../chunk.js";
import { SCORE_BATCH_SIZE, scoreItems } from "../llm.js";
import { type RunStepInfo, recordStep } from "../run-stats.js";
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

/** What the `score` line on the run says.
 *
 * An engine interrupt is not "scored 0 items". That line made a killed step
 * look like a successful empty score and hid a batch that had already
 * finished. A later batch's interrupt keeps the count from the batches that
 * returned. */
export function scoreStepRecord(
  newCount: number,
  scoredCount: number,
  interruption?: string
): { action: string; reason?: string } {
  if (newCount === 0) return { action: "skipped", reason: "no new items" };
  if (interruption && scoredCount === 0) {
    return { action: "interrupted", reason: interruption };
  }
  return {
    action: `scored ${scoredCount} items`,
    ...(interruption ? { reason: interruption } : {}),
  };
}

function interruptionSince(
  steps: readonly RunStepInfo[],
  name: string,
  from: number
): string | undefined {
  const mark = steps
    .slice(from)
    .find((step) => step.name === name && step.action === "interrupted");
  return mark ? (mark.reason ?? "interrupted") : undefined;
}

export async function scoreNewRows(
  ctx: IngestContext,
  newRows: readonly NewRow[]
): Promise<Map<string, ItemScore>> {
  const { step, env, runId, steps } = ctx;
  if (newRows.length === 0) {
    await llmStep(
      step,
      env,
      runId,
      "score",
      [] as [string, ItemScore][],
      async () => [],
      { config: LLM_STEP }
    );
    const record = scoreStepRecord(0, 0);
    recordStep(steps, "score", record.action, record.reason);
    return new Map();
  }

  // One durable step per batch. `step.do` only checkpoints a return, so an
  // engine timeout of a single shared step used to drop every batch,
  // including ones that had already finished, and the fallback `[]` was
  // recorded as "scored 0 items".
  const batches = chunk(newRows, SCORE_BATCH_SIZE);
  const scored = new Map<string, ItemScore>();
  let interruption: string | undefined;
  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index] ?? [];
    const name = `score-${index}`;
    const from = steps.length;
    const entries = jsonMap(
      await llmStep(
        step,
        env,
        runId,
        `score-${index}`,
        [] as [string, ItemScore][],
        async () => {
          try {
            const results = await scoreItems(
              env,
              batch.map((row, i) => ({
                i,
                // Decision identity: lets the optional JEV panel key its
                // idempotency to this item inside this run.
                id: row.id,
                title: row.item.title,
                summary: row.item.summary,
                source: row.source.id,
              }))
            );
            return mapEntries(keyResultsById(batch, results));
          } catch (error) {
            console.error("score step failed:", error);
            return [];
          }
        },
        { config: LLM_STEP, steps }
      )
    );
    const batchInterrupted = interruptionSince(steps, name, from);
    if (batchInterrupted) {
      interruption = batchInterrupted;
      continue;
    }
    for (const [id, item] of entries) scored.set(id, item);
  }
  const record = scoreStepRecord(newRows.length, scored.size, interruption);
  recordStep(steps, "score", record.action, record.reason);
  return scored;
}
