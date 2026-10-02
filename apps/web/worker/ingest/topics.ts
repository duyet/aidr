import { captureAndLearnTopics } from "../topic-learning.js";
import { normalizeTopics } from "../topics.js";
import { jsonMap, mapEntries } from "../workflow-run.js";
import { llmStep, safeStep } from "../workflow-step.js";
import { type IngestContext, LLM_STEP, type NewRow } from "./context.js";
import type { ItemScore } from "./score.js";

/**
 * Rewrites each item's raw score tags into canonical topic names
 * (rules-based first, LLM-mapped for unseen variants), persisting the
 * `topics` table's per-variant counts. Runs before merge-similar so a
 * cluster's topic union already has canonical values to dedupe against.
 */
export async function normalizeNewRowTopics(
  ctx: IngestContext,
  newRows: readonly NewRow[],
  scored: ReadonlyMap<string, ItemScore>,
  now: number
): Promise<Map<string, string[]>> {
  const { step, env, runId } = ctx;
  return jsonMap(
    await llmStep(
      step,
      env,
      runId,
      "normalize-topics",
      [] as [string, string[]][],
      async () => {
        if (newRows.length === 0) return [];
        try {
          const rawTagsByItem = new Map<string, string[]>(
            newRows.map((row) => [row.id, scored.get(row.id)?.tags ?? []])
          );
          return mapEntries(await normalizeTopics(env, rawTagsByItem, now));
        } catch (error) {
          console.error("normalize-topics step failed:", error);
          return [];
        }
      },
      { config: LLM_STEP }
    )
  );
}

/** Capture per-day topic frequencies and promote emerging entity / model
 * tags into learned_keywords for title highlight + trending. */
export async function learnTopics(
  ctx: IngestContext,
  newRows: readonly NewRow[],
  canonicalTagsByItem: Map<string, string[]>,
  now: number
): Promise<void> {
  const { step, env } = ctx;
  await safeStep(step, "learn-topics", undefined, async () => {
    if (canonicalTagsByItem.size === 0) return;
    try {
      const titlesByItem = new Map(
        newRows.map((row) => [row.id, row.item.title])
      );
      const { promoted } = await captureAndLearnTopics(
        env.DB,
        canonicalTagsByItem,
        now,
        titlesByItem
      );
      if (promoted.length > 0) {
        console.log(
          `learn-topics promoted ${promoted.length}: ${promoted.slice(0, 8).join(", ")}`
        );
      }
    } catch (error) {
      console.error("learn-topics step failed:", error);
    }
  });
}
