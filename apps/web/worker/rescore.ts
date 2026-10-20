import { RELEVANCE_THRESHOLD } from "./ingest/context.js";
import { scoreItems } from "./llm.js";
import { type RankableRow, rankScoreForRow } from "./ranking.js";
import { captureAndLearnTopics } from "./topic-learning.js";
import { normalizeTopics, type ScoredStoryTags } from "./topics.js";
import type { Env } from "./types.js";

export interface RescoreRow extends RankableRow {
  id: string;
  title: string;
  summary: string | null;
}

/**
 * Scores `rows` again and writes the result back by id: the llm_* columns,
 * category, canonical tags and rank_score, with a published row under
 * `RELEVANCE_THRESHOLD` hidden as `rejected` (ALGORITHM §4). The canonical
 * tags also feed `topic_daily` and the learned keywords, so a rescored story
 * counts toward trending like a freshly ingested one. Never inserts a row.
 */
export async function rescoreItems(
  env: Env,
  rows: readonly RescoreRow[]
): Promise<{ scored: number; tokens: number }> {
  if (rows.length === 0) return { scored: 0, tokens: 0 };

  const results = await scoreItems(
    env,
    rows.map((row, i) => ({
      i,
      id: row.id,
      title: row.title,
      summary: row.summary ?? undefined,
      source: row.source_id,
    }))
  );

  const storiesById = new Map<string, ScoredStoryTags>();
  const scored: { row: RescoreRow; result: (typeof results)[number] }[] = [];
  for (const result of results) {
    const row = rows[result.i];
    if (!row) continue;
    scored.push({ row, result });
    storiesById.set(row.id, {
      tags: result.tags,
      title: row.title,
      sourceId: row.source_id,
    });
  }

  const nowMs = Date.now();
  const canonicalTags = await normalizeTopics(env, storiesById, nowMs);
  await captureAndLearnTopics(
    env.DB,
    canonicalTags,
    nowMs,
    new Map(rows.map((row) => [row.id, row.title]))
  );

  let tokens = 0;
  const statements = scored.map(({ row, result }) => {
    tokens += result.tokens;
    return env.DB.prepare(
      `UPDATE items SET
         llm_relevance = ?, llm_importance = ?, llm_quality = ?,
         category = ?, tags = ?, rank_score = ?,
         status = CASE WHEN status = 'published' AND ? < ?
           THEN 'rejected' ELSE status END
       WHERE id = ?`
    ).bind(
      result.relevance,
      result.importance,
      result.quality,
      result.category || null,
      JSON.stringify(canonicalTags.get(row.id) ?? result.tags),
      rankScoreForRow(row, nowMs, result),
      result.relevance,
      RELEVANCE_THRESHOLD,
      row.id
    );
  });
  if (statements.length > 0) await env.DB.batch(statements);
  return { scored: statements.length, tokens };
}
