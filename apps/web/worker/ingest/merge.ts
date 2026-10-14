import {
  type ClusterGateTally,
  type GatedClusters,
  type GateHeadline,
  gateLlmClusters,
  parseClusterGate,
  tallyClusterGate,
} from "../cluster-gate.js";
import { MAX_SOURCES_PER_ITEM } from "../d1-bind.js";
import {
  buildMergePlan,
  clusterByTitleSimilarity,
  clusterOfficialRewrites,
  clusterSimilar,
  type DemotedCanonicalDetail,
  type ExistingCandidate,
  foldDemotedCanonicals,
  type MergeCandidate,
  type MergePlan,
  mergeClusters,
  type OfficialRewriteInput,
} from "../dedupe.js";
import { parseMediaManifest } from "../media.js";
import { isMediaManifestSchemaError } from "../media-schema.js";
import { rankScore, rankSignals } from "../ranking.js";
import { sourceFamily } from "../source-diversity.js";
import { officialSourceFor } from "../sources/catalog.js";
import type { FetchedItemSource } from "../sources/types.js";
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
  RELEVANCE_THRESHOLD,
} from "./context.js";
import type { ItemScore } from "./score.js";
import { parseTagsJson } from "./write-plan.js";

export const EMPTY_MERGE_PLAN: MergePlan = {
  merged: new Map(),
  canonicalUpdates: new Map(),
  demoted: new Map(),
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
  /** Absent in plans serialized before demotion existed. */
  demoted?: [string, string][];
};

/** Workflow step returns are JSON-serialized, and a `Map` becomes `{}`.
 * The plan crosses the step boundary as entry arrays. */
export function serializeMergePlan(plan: MergePlan): SerializedMergePlan {
  return {
    merged: mapEntries(plan.merged),
    canonicalUpdates: mapEntries(plan.canonicalUpdates),
    demoted: mapEntries(plan.demoted),
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
    demoted: jsonMap(serialized?.demoted),
  };
}

export interface RecentClusterRow {
  id: string;
  source_id: string;
  url: string;
  title: string;
  published_at: number;
  tags: string | null;
  points: number;
  comments: number;
  image_url: string | null;
  media_manifest: string | null;
  /** `translations.title` in the other language, for the cluster gate. */
  translation: string | null;
}

/** An item's headline facts for the official-rewrite rule
 * (`isOfficialRewrite`): the pass that clusters a post with its rewrites,
 * and the gate on an official item taking a story over. */
export function headlineOf(
  sourceId: string,
  url: string,
  title: string,
  publishedAt: number
): OfficialRewriteInput {
  return {
    title,
    publishedAt,
    officialOrgs: officialSourceFor(sourceId, url)?.official,
    aggregator: sourceFamily(sourceId, url) === "aggregator",
  };
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
      publishedAt: row.item.publishedAt * 1000,
      now,
      ...rankSignals([
        {
          sourceId: row.source.id,
          points: row.item.points ?? 0,
          comments: row.item.comments ?? 0,
          url: row.item.url,
        },
      ]),
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
      official:
        officialSourceFor(row.source.id, row.item.url) !== undefined &&
        (score?.relevance ?? 0.5) >= RELEVANCE_THRESHOLD,
      headline: headlineOf(
        row.source.id,
        row.item.url,
        row.item.title,
        row.item.publishedAt
      ),
    };
  });
}

export function toExistingCandidates(
  rows: readonly Omit<RecentClusterRow, "translation">[]
): Map<string, ExistingCandidate> {
  return new Map<string, ExistingCandidate>(
    rows.map((r) => [
      r.id,
      {
        points: r.points,
        comments: r.comments,
        imageUrl: r.image_url,
        mediaManifest: parseMediaManifest(r.media_manifest, r.image_url, r.url),
        sourceId: r.source_id,
        url: r.url,
        topics: parseTagsJson(r.tags),
        official: officialSourceFor(r.source_id, r.url) !== undefined,
        headline: headlineOf(r.source_id, r.url, r.title, r.published_at),
      },
    ])
  );
}

/** Item ids per `IN (...)` read of demoted canonicals' rows. */
const DEMOTED_READ_CHUNK = 50;

/** Each demoted canonical's `item_sources` and earlier merged items, so the
 * official item replacing it inherits them (`foldDemotedCanonicals`). */
async function readDemotedDetails(
  db: D1Database,
  demoted: ReadonlyMap<string, string>,
  existing: ReadonlyMap<string, ExistingCandidate>
): Promise<Map<string, DemotedCanonicalDetail>> {
  const details = new Map<string, DemotedCanonicalDetail>();
  const ids = [...demoted.keys()];
  for (let start = 0; start < ids.length; start += DEMOTED_READ_CHUNK) {
    const part = ids.slice(start, start + DEMOTED_READ_CHUNK);
    const placeholders = part.map(() => "?").join(",");
    const [sourceRes, memberRes] = await db.batch([
      db
        .prepare(
          `SELECT item_id, kind, author, posted_at, quote, url FROM item_sources
           WHERE item_id IN (${placeholders}) ORDER BY item_id, position`
        )
        .bind(...part),
      db
        .prepare(
          `SELECT id, duplicate_of, source_id, points, comments, url FROM items
           WHERE status = 'merged' AND duplicate_of IN (${placeholders})`
        )
        .bind(...part),
    ]);
    for (const id of part) {
      details.set(id, {
        url: existing.get(id)?.url ?? "",
        sources: [],
        members: [],
      });
    }
    for (const row of (sourceRes.results ?? []) as {
      item_id: string;
      kind: FetchedItemSource["kind"];
      author: string | null;
      posted_at: number | null;
      quote: string | null;
      url: string | null;
    }[]) {
      details.get(row.item_id)?.sources.push({
        kind: row.kind,
        author: row.author ?? undefined,
        postedAt: row.posted_at ?? undefined,
        quote: row.quote ?? undefined,
        url: row.url ?? undefined,
      });
    }
    for (const row of (memberRes.results ?? []) as {
      id: string;
      duplicate_of: string;
      source_id: string;
      points: number;
      comments: number;
      url: string;
    }[]) {
      details.get(row.duplicate_of)?.members.push({
        id: row.id,
        sourceId: row.source_id,
        points: row.points,
        comments: row.comments,
        url: row.url,
      });
    }
  }
  return details;
}

/** The merge-similar step's result: the plan, and this run's cluster-gate
 *  tally (absent on steps recorded before the gate). */
type MergeStepResult = SerializedMergePlan & { clusterGate?: ClusterGateTally };

function logGateRejections(
  model: string | null,
  gated: GatedClusters,
  newItems: ReadonlyMap<number, GateHeadline>,
  existing: ReadonlyMap<string, GateHeadline>
): void {
  for (const { existingId, newIndices } of gated.rejected) {
    const titles = newIndices.map((i) => newItems.get(i)?.title ?? `#${i}`);
    console.warn(
      `cluster gate: ${model ?? "unknown model"} linked ${existingId.slice(0, 8)} "${existing.get(existingId)?.title ?? ""}" to unrelated ${JSON.stringify(titles)}; kept apart`
    );
  }
}

/** Clusters new items with each other and with recently published items
 * (LLM + title similarity), then plans which ones fold into a canonical. The
 * LLM's links to existing items pass the cluster gate (`cluster-gate.ts`)
 * first; `clusterGate` counts what it proposed and what the gate rejected. */
export async function planMerges(
  ctx: IngestContext,
  newRows: readonly NewRow[],
  scored: ReadonlyMap<string, ItemScore>,
  canonicalTagsByItem: ReadonlyMap<string, string[]>,
  now: number
): Promise<{ plan: MergePlan; clusterGate: ClusterGateTally }> {
  const { step, env, runId } = ctx;
  const noMerges: MergeStepResult = serializeMergePlan(EMPTY_MERGE_PLAN);
  const result = await llmStep(
    step,
    env,
    runId,
    "merge-similar",
    noMerges,
    async () => {
      if (newRows.length === 0) return noMerges;
      let clusterGate: ClusterGateTally = {};
      const withGate = (plan: MergePlan): MergeStepResult => ({
        ...serializeMergePlan(plan),
        clusterGate,
      });
      try {
        const { results: recentForClustering } = await env.DB.prepare(
          `SELECT i.id, i.source_id, i.url, i.title, i.published_at, i.tags,
                  i.points, i.comments, i.image_url, i.media_manifest,
                  t.title AS translation
           FROM items i
           LEFT JOIN translations t ON t.item_id = i.id
             AND t.lang = CASE i.source_lang WHEN 'vi' THEN 'en' ELSE 'vi' END
           WHERE i.status = 'published' AND i.published_at >= ?
           ORDER BY i.published_at DESC
           LIMIT ${MERGE_CANDIDATE_LIMIT}`
        )
          .bind(toEpochSeconds(now) - MERGE_LOOKBACK_SEC)
          .all<RecentClusterRow>();
        const recent = recentForClustering ?? [];

        const newForCluster = newRows.map((row, i) => ({
          i,
          title: row.item.title,
          url: row.item.url,
          source: row.source.id,
        }));
        const existingForCluster = recent.map((r) => ({
          id: r.id,
          title: r.title,
        }));
        const llm = await clusterSimilar(
          env,
          newForCluster,
          existingForCluster
        );
        const newHeadlines = new Map<number, GateHeadline>(
          newRows.map((row, i) => [
            i,
            {
              title: row.item.title,
              sourceId: row.source.id,
              url: row.item.url,
            },
          ])
        );
        const existingHeadlines = new Map<string, GateHeadline>(
          recent.map((r) => [
            r.id,
            {
              title: r.title,
              sourceId: r.source_id,
              url: r.url,
              translation: r.translation,
            },
          ])
        );
        const gated = gateLlmClusters(
          llm.clusters,
          newHeadlines,
          existingHeadlines
        );
        logGateRejections(llm.model, gated, newHeadlines, existingHeadlines);
        clusterGate = tallyClusterGate(llm.model, gated);
        const titleClusters = clusterByTitleSimilarity(
          newForCluster,
          existingForCluster
        );
        const officialClusters = clusterOfficialRewrites(
          newRows.map((row, i) => ({
            i,
            ...headlineOf(
              row.source.id,
              row.item.url,
              row.item.title,
              row.item.publishedAt
            ),
          })),
          recent.map((r) => ({
            id: r.id,
            ...headlineOf(r.source_id, r.url, r.title, r.published_at),
          }))
        );
        const clusters = mergeClusters([
          gated.clusters,
          titleClusters,
          officialClusters,
        ]);
        if (clusters.length === 0) return withGate(EMPTY_MERGE_PLAN);

        const existing = toExistingCandidates(recent);
        const plan = buildMergePlan(
          clusters,
          buildMergeCandidates(newRows, scored, canonicalTagsByItem, now),
          existing,
          MAX_SOURCES_PER_ITEM,
          MAX_MERGED_TOPICS
        );
        if (plan.demoted.size === 0) return withGate(plan);
        try {
          return withGate(
            foldDemotedCanonicals(
              plan,
              await readDemotedDetails(env.DB, plan.demoted, existing),
              MAX_SOURCES_PER_ITEM
            )
          );
        } catch (error) {
          // The write step still re-points the merged items in SQL; only
          // the copied sources and the corroboration in the first rank
          // are lost until the next re-rank.
          console.error("merge-similar demoted read failed:", error);
          return withGate(plan);
        }
      } catch (error) {
        if (isMediaManifestSchemaError(error)) throw error;
        console.error("merge-similar step failed:", error);
        return withGate(EMPTY_MERGE_PLAN);
      }
    },
    { config: LLM_STEP }
  );
  return {
    plan: restoreMergePlan(result),
    clusterGate: parseClusterGate(result?.clusterGate),
  };
}
