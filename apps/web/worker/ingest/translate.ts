import type { MergePlan } from "../dedupe.js";
import { translateItems } from "../llm.js";
import { recordStep } from "../run-stats.js";
import { jsonMap, mapEntries } from "../workflow-run.js";
import { llmStep } from "../workflow-step.js";
import {
  type IngestContext,
  LLM_STEP,
  type NewRow,
  RELEVANCE_THRESHOLD,
} from "./context.js";
import { type ItemScore, keyResultsById } from "./score.js";

export type ItemTranslation = Awaited<
  ReturnType<typeof translateItems>
>[number];

/** Rows that will be published this run: not merged into another story, and
 * either unscored (score step failed — publish rather than lose the item) or
 * at/above the relevance threshold. Only these are worth translating. */
export function selectPublishedRows(
  newRows: readonly NewRow[],
  scored: ReadonlyMap<string, ItemScore>,
  mergePlan: MergePlan
): NewRow[] {
  return newRows.filter((row) => {
    if (mergePlan.merged.has(row.id)) return false; // skip translate for merged items
    const score = scored.get(row.id);
    return !score || score.relevance >= RELEVANCE_THRESHOLD;
  });
}

/** The `translate` run-step summary + detail. The detail names the failure
 * mode so the runs dashboard can tell "nothing to do" from "LLM failed". */
export function translateStepSummary(
  newCount: number,
  publishedCount: number,
  translatedCount: number
): { summary: string; detail: string | undefined } {
  if (publishedCount === 0) {
    return {
      summary: "skipped",
      detail:
        newCount === 0
          ? "no new items"
          : "no items cleared the relevance threshold",
    };
  }
  return {
    summary: `translated ${translatedCount}/${publishedCount} items`,
    detail:
      translatedCount === 0
        ? "translateItems.batch_failed — title_vi left empty (EN badge) until backfill"
        : translatedCount < publishedCount
          ? `partial ${translatedCount}/${publishedCount}`
          : undefined,
  };
}

export async function translatePublishedRows(
  ctx: IngestContext,
  newRows: readonly NewRow[],
  publishedRows: readonly NewRow[]
): Promise<Map<string, ItemTranslation>> {
  const { step, env, runId, steps } = ctx;
  const translated = jsonMap(
    await llmStep(
      step,
      env,
      runId,
      "translate",
      [] as [string, ItemTranslation][],
      async () => {
        if (publishedRows.length === 0) return [];
        try {
          const results = await translateItems(
            env,
            publishedRows.map((row, i) => ({
              i,
              title: row.item.title,
              summary: row.item.summary,
              sourceLang: row.item.sourceLang ?? "en",
            }))
          );
          return mapEntries(keyResultsById(publishedRows, results));
        } catch (error) {
          console.error("translate step failed:", error);
          return [];
        }
      },
      LLM_STEP
    )
  );
  const { summary, detail } = translateStepSummary(
    newRows.length,
    publishedRows.length,
    translated.size
  );
  recordStep(steps, "translate", summary, detail);
  return translated;
}
