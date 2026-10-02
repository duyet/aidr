import { BACKFILL_SCORE_CAP, buildUnscoredItemsQuery } from "../backfill.js";
import { scoreItems } from "../llm.js";
import { type RankSignalRow, rankScore, rowRankSignals } from "../ranking.js";
import { recordStep } from "../run-stats.js";
import { normalizeTopics } from "../topics.js";
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

        const scoredRows = await scoreItems(
          env,
          rows.map((row, i) => ({
            i,
            id: row.id,
            title: row.title,
            summary: row.summary ?? undefined,
            source: row.source_id,
          }))
        );
        const rawTagsByItem = new Map<string, string[]>();
        for (const result of scoredRows) {
          tokens += result.tokens;
          const row = rows[result.i];
          if (row) rawTagsByItem.set(row.id, result.tags);
        }
        const canonical = await normalizeTopics(env, rawTagsByItem, Date.now());
        const now = Date.now();
        for (const result of scoredRows) {
          const row = rows[result.i];
          if (!row) continue;
          const tags = canonical.get(row.id) ?? result.tags;
          const rank = rankScore({
            importance: result.importance,
            quality: result.quality,
            publishedAt: row.published_at * 1000,
            now,
            ...rowRankSignals(row),
          });
          await env.DB.prepare(
            `UPDATE items SET
                 llm_relevance = ?, llm_importance = ?, llm_quality = ?,
                 category = ?, tags = ?, rank_score = ?
               WHERE id = ?`
          )
            .bind(
              result.relevance,
              result.importance,
              result.quality,
              result.category,
              JSON.stringify(tags),
              rank,
              row.id
            )
            .run();
          scoredCount++;
        }
      } catch (error) {
        console.error("backfill-score step failed:", error);
      }
      return { scoredCount, tokens };
    },
    LLM_STEP
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
