import { BACKFILL_SCORE_CAP, buildUnscoredItemsQuery } from "../backfill.js";
import type { RankSignalRow } from "../ranking.js";
import { rescoreItems } from "../rescore.js";
import { recordStep } from "../run-stats.js";
import { llmStep } from "../workflow-step.js";
import { type IngestContext, LLM_STEP } from "./context.js";

interface UnscoredRow extends RankSignalRow {
  id: string;
  title: string;
  summary: string | null;
  published_at: number;
}

/** Scores items that never got an LLM score (e.g. the score step failed on
 * their run), so they stop ranking on neutral defaults. */
export async function backfillScores(
  ctx: IngestContext
): Promise<{ scoredCount: number; tokens: number }> {
  const { step, env, runId, steps } = ctx;
  const result = await llmStep(
    step,
    env,
    runId,
    "backfill-score",
    { scoredCount: 0, tokens: 0 },
    async () => {
      let scoredCount = 0;
      let tokens = 0;
      try {
        const { results } = await env.DB.prepare(
          buildUnscoredItemsQuery(BACKFILL_SCORE_CAP)
        ).all<UnscoredRow>();
        const rows = results ?? [];
        if (rows.length === 0) return { scoredCount, tokens };

        const rescored = await rescoreItems(env, rows);
        scoredCount = rescored.scored;
        tokens = rescored.tokens;
      } catch (error) {
        console.error("backfill-score step failed:", error);
      }
      return { scoredCount, tokens };
    },
    { config: LLM_STEP }
  );
  recordStep(
    steps,
    "backfill-score",
    result.scoredCount === 0
      ? "0 candidates"
      : `scored ${result.scoredCount} items`
  );
  return result;
}
