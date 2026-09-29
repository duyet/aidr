import { MAX_SOURCES_PER_ITEM } from "../d1-bind.js";
import {
  buildMergePlan,
  clusterByTitleSimilarity,
  clusterSimilar,
  type ExistingCandidate,
  type MergeCandidate,
  type MergePlan,
  mergeClusters,
} from "../dedupe.js";
import { parseMediaManifest } from "../media.js";
import { isMediaManifestSchemaError } from "../media-schema.js";
import { rankScore } from "../ranking.js";
import { toEpochSeconds } from "../time.js";
import { MAX_MERGED_TOPICS } from "../topics.js";
import { jsonMap, mapEntries } from "../workflow-run.js";
import { llmStep } from "../workflow-step.js";
import {
  type IngestContext,
  LLM_STEP,
  MERGE_CANDIDATE_LIMIT,
  MERGE_LOOKBACK_SEC,
  type NewRow,
} from "./context.js";
import type { ItemScore } from "./score.js";

export const EMPTY_MERGE_PLAN: MergePlan = {
  merged: new Map(),
  canonicalUpdates: new Map(),
};

export type SerializedMergePlan = {
  merged: [
    string,
    MergePlan["merged"] extends Map<string, infer V> ? V : never,
  ][];
  canonicalUpdates: [
    string,
    MergePlan["canonicalUpdates"] extends Map<string, infer V> ? V : never,
  ][];
};

/** Workflow step returns are JSON-serialized, and a `Map` becomes `{}`.
 * The plan crosses the step boundary as entry arrays. */
export function serializeMergePlan(plan: MergePlan): SerializedMergePlan {
  return {
    merged: mapEntries(plan.merged),
    canonicalUpdates: mapEntries(plan.canonicalUpdates),
  };
}

/** Accepts both a live plan (first run) and its serialized form (replay),
 * so `.get` / `.has` keep working after a Workflow restart. */
export function restoreMergePlan(
  value: MergePlan | SerializedMergePlan | null | undefined
): MergePlan {
  if (value && value.merged instanceof Map) {
    return value as MergePlan;
  }
  const serialized = value as SerializedMergePlan | undefined;
  return {
    merged: jsonMap(serialized?.merged),
    canonicalUpdates: jsonMap(serialized?.canonicalUpdates),
  };
}

export interface RecentClusterRow {
  id: string;
  title: string;
  points: number;
  comments: number;
  image_url: string | null;
  media_manifest: string | null;
}

/** New items as merge candidates. Missing scores fall back to the neutral
 * 5/5 so an unscored item can still win or lose a cluster on engagement. */
export function buildMergeCandidates(
  newRows: readonly NewRow[],
  scored: ReadonlyMap<string, ItemScore>,
  canonicalTagsByItem: ReadonlyMap<string, string[]>,
  now: number
): MergeCandidate[] {
  return newRows.map((row, i) => {
    const score = scored.get(row.id);
    const rank = rankScore({
      importance: score?.importance ?? 5,
      quality: score?.quality ?? 5,
      points: row.item.points ?? 0,
      comments: row.item.comments ?? 0,
      publishedAt: row.item.publishedAt * 1000,
      now,
      sourceCount: row.item.sources?.length ?? 0,
    });
    return {
      i,
      id: row.id,
      url: row.item.url,
      sourceId: row.source.id,
      sources: row.item.sources,
      topics: canonicalTagsByItem.get(row.id),
      points: row.item.points ?? 0,
      comments: row.item.comments ?? 0,
      rank,
      imageUrl: row.item.imageUrl,
      mediaManifest: row.item.mediaManifest,
    };
  });
}

export function toExistingCandidates(
  rows: readonly RecentClusterRow[]
): Map<string, ExistingCandidate> {
  return new Map<string, ExistingCandidate>(
    rows.map((r) => [
      r.id,
      {
        points: r.points,
        comments: r.comments,
        imageUrl: r.image_url,
        mediaManifest: parseMediaManifest(r.media_manifest, r.image_url),
      },
    ])
  );
}

/** Clusters new items with each other and with recently published items
 * (LLM + title similarity), then plans which ones fold into a canonical. */
export async function planMerges(
  ctx: IngestContext,
  newRows: readonly NewRow[],
  scored: ReadonlyMap<string, ItemScore>,
  canonicalTagsByItem: ReadonlyMap<string, string[]>,
  now: number
): Promise<MergePlan> {
  const { step, env, runId } = ctx;
  return restoreMergePlan(
    await llmStep(
      step,
      env,
      runId,
      "merge-similar",
      serializeMergePlan(EMPTY_MERGE_PLAN),
      async () => {
        if (newRows.length === 0) return serializeMergePlan(EMPTY_MERGE_PLAN);
        try {
          const { results: recentForClustering } = await env.DB.prepare(
            `SELECT id, title, points, comments, image_url, media_manifest FROM items
           WHERE status = 'published' AND published_at >= ?
           ORDER BY published_at DESC
           LIMIT ${MERGE_CANDIDATE_LIMIT}`
          )
            .bind(toEpochSeconds(now) - MERGE_LOOKBACK_SEC)
            .all<RecentClusterRow>();

          const newForCluster = newRows.map((row, i) => ({
            i,
            title: row.item.title,
            url: row.item.url,
            source: row.source.id,
          }));
          const existingForCluster = (recentForClustering ?? []).map((r) => ({
            id: r.id,
            title: r.title,
          }));
          const llmClusters = await clusterSimilar(
            env,
            newForCluster,
            existingForCluster
          );
          const titleClusters = clusterByTitleSimilarity(
            newForCluster,
            existingForCluster
          );
          const clusters = mergeClusters([llmClusters, titleClusters]);
          if (clusters.length === 0) return EMPTY_MERGE_PLAN;

          return serializeMergePlan(
            buildMergePlan(
              clusters,
              buildMergeCandidates(newRows, scored, canonicalTagsByItem, now),
              toExistingCandidates(recentForClustering ?? []),
              MAX_SOURCES_PER_ITEM,
              MAX_MERGED_TOPICS
            )
          );
        } catch (error) {
          if (isMediaManifestSchemaError(error)) throw error;
          console.error("merge-similar step failed:", error);
          return serializeMergePlan(EMPTY_MERGE_PLAN);
        }
      },
      LLM_STEP
    )
  );
}
