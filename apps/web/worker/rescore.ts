import { RELEVANCE_THRESHOLD } from "./ingest/context.js";
import { parseTagsJson } from "./ingest/write-plan.js";
import { scoreItems } from "./llm.js";
import { type RankableRow, rankScoreForRow } from "./ranking.js";
import { toEpochSeconds } from "./time.js";
import { learningDayKey, recordTopicDaily } from "./topic-learning.js";
import {
  normalizeTopicName,
  normalizeTopics,
  type ScoredStoryTags,
} from "./topics.js";
import type { Env } from "./types.js";

export interface RescoreRow extends RankableRow {
  id: string;
  title: string;
  summary: string | null;
  /** Stored canonical tags: the ones ingest already counted in topic_daily. */
  tags: string | null;
  /** Epoch seconds of the first fetch, the run that counted `tags`. */
  fetched_at: number;
}

/**
 * Scores `rows` again and writes the result back by id: the llm_* columns,
 * category, canonical tags and rank_score, with a published row under
 * `RELEVANCE_THRESHOLD` hidden as `rejected` (ALGORITHM §4). Ingest already
 * counted the row's stored tags and title entities in `topic_daily`, so only
 * the tags this rescore adds are counted, on the row's ingest day. Never
 * inserts a row.
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
  await recordAddedTags(
    env.DB,
    scored.map(({ row }) => row),
    canonicalTags
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

/** Counts in `topic_daily` each canonical tag a row gained over its stored
 * tags, on the day the row was fetched. */
async function recordAddedTags(
  db: D1Database,
  rows: readonly RescoreRow[],
  canonicalTags: ReadonlyMap<string, string[]>
): Promise<void> {
  const countsByDay = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const counted = new Set(parseTagsJson(row.tags).map(normalizeTopicName));
    const added = new Set(
      (canonicalTags.get(row.id) ?? [])
        .map(normalizeTopicName)
        .filter((name) => name && !counted.has(name))
    );
    if (added.size === 0) continue;
    const day = learningDayKey(toEpochSeconds(row.fetched_at) * 1000);
    const counts = countsByDay.get(day) ?? new Map<string, number>();
    for (const name of added) counts.set(name, (counts.get(name) ?? 0) + 1);
    countsByDay.set(day, counts);
  }
  try {
    for (const [day, counts] of countsByDay) {
      await recordTopicDaily(
        db,
        [...counts].map(([topic, count]) => ({ topic, count })),
        day
      );
    }
  } catch (error) {
    console.error("rescore: recording added tags failed:", error);
  }
}
