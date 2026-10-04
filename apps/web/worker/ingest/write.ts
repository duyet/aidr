import {
  buildItemBindArgs,
  buildItemSourceBindArgs,
  MAX_SOURCES_PER_ITEM,
  nn,
  prepareContentChangeLogs,
  prepareTranslationUpsert,
} from "../d1-bind.js";
import {
  type CanonicalUpdate,
  type MergePlan,
  unionSources,
} from "../dedupe.js";
import { serializeMediaManifest } from "../media.js";
import {
  buildRerankQuery,
  type RankSignalRow,
  rankScore,
  rankSignals,
  rowRankSignals,
} from "../ranking.js";
import type { FetchedItemSource } from "../sources/types.js";
import { toEpochSeconds } from "../time.js";
import type { Env } from "../types.js";
import { safeStep } from "../workflow-step.js";
import {
  type IngestContext,
  type NewRow,
  RANK_RECOMPUTE_WINDOW_SEC,
} from "./context.js";
import type { ItemScore } from "./score.js";
import type { ItemTranslation } from "./translate.js";
import {
  type ExistingCanonicalRow,
  planExistingCanonicalMedia,
  planNewItemWrite,
} from "./write-plan.js";

const UPSERT_ITEM_SQL = `INSERT INTO items (
                id, source_id, external_id, url, title, summary,
                published_at, fetched_at, points, comments,
                llm_relevance, llm_importance, llm_quality, category, tags,
                rank_score, status, llm_tokens, duplicate_of, image_url,
                source_lang, media_manifest
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                published_at = excluded.published_at,
                points = excluded.points,
                comments = excluded.comments,
                summary = excluded.summary,
                llm_relevance = excluded.llm_relevance,
                llm_importance = excluded.llm_importance,
                llm_quality = excluded.llm_quality,
                category = excluded.category,
                tags = excluded.tags,
                rank_score = excluded.rank_score,
                status = excluded.status,
                llm_tokens = excluded.llm_tokens,
                duplicate_of = excluded.duplicate_of,
                image_url = excluded.image_url,
                source_lang = CASE
                   WHEN items.source_lang = 'vi' AND excluded.source_lang = 'en'
                   THEN items.source_lang
                   ELSE excluded.source_lang
                 END,
                media_manifest = excluded.media_manifest`;

export const INSERT_ITEM_SOURCE_SQL = `INSERT INTO item_sources (item_id, position, kind, author, posted_at, quote, url)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;

/** Replace an item's `item_sources` rows with `sources`, in order. */
function replaceItemSources(
  env: Env,
  itemId: string,
  sources: FetchedItemSource[]
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("DELETE FROM item_sources WHERE item_id = ?").bind(
      nn(itemId)
    ),
  ];
  for (const row of buildItemSourceBindArgs(itemId, sources)) {
    statements.push(env.DB.prepare(INSERT_ITEM_SOURCE_SQL).bind(...row));
  }
  return statements;
}

/** Canonicals that are pre-existing (already-published) items absorb the
 * merged new items' points/comments/sources too, but need their own
 * read-update-write since they're not part of `newRows`. Their rank_score is
 * recomputed here from the merged values: the window re-rank reads D1 before
 * this batch lands, so it would only see the pre-merge engagement. */
async function existingCanonicalStatements(
  env: Env,
  canonicalId: string,
  update: CanonicalUpdate,
  now: number
): Promise<D1PreparedStatement[]> {
  const existingRow = await env.DB.prepare(
    `SELECT tags, url, image_url, media_manifest, source_id,
            published_at, llm_importance, llm_quality
     FROM items WHERE id = ?`
  )
    .bind(canonicalId)
    .first<
      ExistingCanonicalRow & {
        source_id: string;
        published_at: number;
        llm_importance: number | null;
        llm_quality: number | null;
      }
    >();
  const media = planExistingCanonicalMedia(existingRow, update);

  const { results: existingSourceRows } = await env.DB.prepare(
    "SELECT kind, author, posted_at, quote, url FROM item_sources WHERE item_id = ? ORDER BY position"
  )
    .bind(canonicalId)
    .all<{
      kind: "source" | "support" | "discussion";
      author: string | null;
      posted_at: number | null;
      quote: string | null;
      url: string | null;
    }>();

  const mergedSources = unionSources(
    (existingSourceRows ?? []).map((r) => ({
      kind: r.kind,
      author: r.author ?? undefined,
      postedAt: r.posted_at ?? undefined,
      quote: r.quote ?? undefined,
      url: r.url ?? undefined,
    })),
    update.extraSources,
    MAX_SOURCES_PER_ITEM,
    existingRow?.url
  );

  // Items merged into it on earlier runs; this run's are in `update.members`
  // (their rows land in the same batch).
  const { results: mergedRows } = await env.DB.prepare(
    "SELECT source_id, points, comments, url FROM items WHERE status = 'merged' AND duplicate_of = ?"
  )
    .bind(canonicalId)
    .all<{
      source_id: string;
      points: number;
      comments: number;
      url: string;
    }>();

  const rank = existingRow
    ? rankScore({
        importance: existingRow.llm_importance ?? 5,
        quality: existingRow.llm_quality ?? 5,
        publishedAt: existingRow.published_at * 1000,
        now,
        // Same members RANK_SIGNAL_COLUMNS reads once this batch lands.
        ...rankSignals([
          {
            sourceId: existingRow.source_id,
            points: update.maxPoints,
            comments: update.maxComments,
            url: existingRow.url,
          },
          ...(mergedRows ?? []).map((r) => ({
            sourceId: r.source_id,
            points: r.points,
            comments: r.comments,
            url: r.url,
          })),
          ...(update.members ?? []),
        ]),
      })
    : null;

  return [
    env.DB.prepare(
      `UPDATE items SET
                 points = ?, comments = ?, tags = ?, image_url = ?,
                 media_manifest = ?, rank_score = COALESCE(?, rank_score)
               WHERE id = ?`
    ).bind(
      nn(update.maxPoints),
      nn(update.maxComments),
      nn(JSON.stringify(media.topics)),
      nn(media.imageUrl),
      serializeMediaManifest(media.manifest),
      nn(rank),
      nn(canonicalId)
    ),
    ...replaceItemSources(env, canonicalId, mergedSources),
  ];
}

/** Statements that hand a demoted canonical's story to the official item
 * replacing it (`MergePlan.demoted`): the old canonical and everything
 * merged into it point at the new one, so the cluster stays one level deep
 * and its permalink resolves to the new canonical (`getStory`). Sent
 * notifications move with the story, so the official item is not posted
 * again and the day's sent count does not double. Its `item_sources` rows
 * stay; merged items' sources are never shown. Runs after the new
 * canonical's upsert in the same batch. */
export function demotedCanonicalStatements(
  db: D1Database,
  demotedId: string,
  canonicalId: string
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        "UPDATE items SET duplicate_of = ? WHERE status = 'merged' AND duplicate_of = ?"
      )
      .bind(nn(canonicalId), nn(demotedId)),
    db
      .prepare(
        "UPDATE items SET status = 'merged', duplicate_of = ? WHERE id = ? AND status = 'published'"
      )
      .bind(nn(canonicalId), nn(demotedId)),
    db
      .prepare(
        "UPDATE OR IGNORE notifications SET item_id = ? WHERE item_id = ?"
      )
      .bind(nn(canonicalId), nn(demotedId)),
  ];
}

/** One statement for the whole re-rank: the scores travel as a single JSON
 *  bind, so ~400 rows stay one D1 query instead of ~400 (per-invocation
 *  query limit) and never hit the 100-bind-per-statement limit. */
export const RERANK_UPDATE_SQL = `UPDATE items SET rank_score = (
    SELECT json_extract(value, '$.r') FROM json_each(?1)
    WHERE json_extract(value, '$.id') = items.id)
  WHERE id IN (SELECT json_extract(value, '$.id') FROM json_each(?1))`;

/** Re-rank every published item from the last RANK_RECOMPUTE_WINDOW_SEC so
 * freshness decay and absorbed engagement show up. Rolling, not the UTC day:
 * a story fetched just after midnight used to keep its first score. A day's
 * archive order can shift for up to 72h, then freezes. Ids written by this
 * run are skipped: they already carry a rank computed from this run's data. */
async function rerankRecentStatements(
  env: Env,
  now: number,
  writtenIds: ReadonlySet<string>
): Promise<D1PreparedStatement[]> {
  const { results: recentItems } = await env.DB.prepare(buildRerankQuery())
    .bind(toEpochSeconds(now) - RANK_RECOMPUTE_WINDOW_SEC)
    .all<
      RankSignalRow & {
        id: string;
        published_at: number;
        llm_importance: number | null;
        llm_quality: number | null;
      }
    >();

  const scores = (recentItems ?? [])
    .filter((row) => !writtenIds.has(row.id))
    .map((row) => ({
      id: row.id,
      r: rankScore({
        importance: row.llm_importance ?? 5,
        quality: row.llm_quality ?? 5,
        // row.published_at is stored as epoch seconds; rankScore expects ms.
        publishedAt: row.published_at * 1000,
        now,
        ...rowRankSignals(row),
      }),
    }));
  if (scores.length === 0) return [];
  return [env.DB.prepare(RERANK_UPDATE_SQL).bind(JSON.stringify(scores))];
}

/** Writes every new row, applies merges to existing canonicals, and
 * re-ranks the last 72h, all in one D1 batch. Rethrows so a failed write surfaces
 * as the run's error instead of a silently empty edition. */
export async function writeItems(
  ctx: IngestContext,
  input: {
    newRows: readonly NewRow[];
    scored: ReadonlyMap<string, ItemScore>;
    translated: ReadonlyMap<string, ItemTranslation>;
    mergePlan: MergePlan;
    canonicalTagsByItem: ReadonlyMap<string, string[]>;
    now: number;
  }
): Promise<void> {
  const { step, env } = ctx;
  const { newRows, scored, translated, mergePlan, canonicalTagsByItem, now } =
    input;
  const newRowIds = new Set(newRows.map((row) => row.id));

  await safeStep(
    step,
    "write-d1",
    undefined,
    async () => {
      const statements: D1PreparedStatement[] = [];

      for (const { id, source, item } of newRows) {
        const mergeEntry = mergePlan.merged.get(id);
        const plan = planNewItemWrite({
          sourceId: source.id,
          item,
          score: scored.get(id),
          translation: translated.get(id),
          mergeEntry,
          canonicalUpdate: mergePlan.canonicalUpdates.get(id),
          canonicalTags: canonicalTagsByItem.get(id),
          now,
        });

        statements.push(
          env.DB.prepare(UPSERT_ITEM_SQL).bind(
            ...buildItemBindArgs({
              id,
              sourceId: source.id,
              item: plan.item,
              score: plan.score,
              rank: plan.rank,
              status: plan.status,
              now,
              llmTokens: plan.llmTokens,
              duplicateOf: mergeEntry?.duplicateOf,
            })
          )
        );

        if (plan.translation) {
          statements.push(
            ...prepareContentChangeLogs(env.DB, {
              id,
              lang: "vi",
              title: plan.translation.title,
              summary: plan.translation.summary,
              reason: "ingest",
            }),
            prepareTranslationUpsert(env.DB, {
              id,
              lang: "vi",
              sourceLang: item.sourceLang ?? "en",
              targetLang: "vi",
              title: plan.translation.title,
              summary: plan.translation.summary,
            })
          );
        }

        if (plan.writeSources) {
          statements.push(
            ...replaceItemSources(env, id, plan.item.sources ?? [])
          );
        }
      }

      const writtenIds = new Set(newRowIds);
      for (const [demotedId, canonicalId] of mergePlan.demoted) {
        // Only when the official item is written as this cluster's
        // published canonical in this batch.
        if (!newRowIds.has(canonicalId)) continue;
        writtenIds.add(demotedId);
        statements.push(
          ...demotedCanonicalStatements(env.DB, demotedId, canonicalId)
        );
      }
      for (const [canonicalId, update] of mergePlan.canonicalUpdates) {
        if (!update.isExisting || newRowIds.has(canonicalId)) continue;
        writtenIds.add(canonicalId);
        statements.push(
          ...(await existingCanonicalStatements(env, canonicalId, update, now))
        );
      }

      statements.push(...(await rerankRecentStatements(env, now, writtenIds)));

      if (statements.length > 0) {
        await env.DB.batch(statements);
      }
    },
    { rethrowErrors: true }
  );
}
