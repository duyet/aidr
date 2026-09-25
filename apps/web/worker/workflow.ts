import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import {
  BACKFILL_BATCH_SIZE,
  BACKFILL_CONTENT_CAP,
  BACKFILL_SCORE_CAP,
  buildMissingMediaQuery,
  buildMissingSummaryQuery,
  buildMissingTranslationQuery,
  buildUnscoredItemsQuery,
  huggingNewsDetailUrl,
  planBackfillUpdate,
} from "./backfill.js";
import {
  buildItemBindArgs,
  buildItemSourceBindArgs,
  MAX_SOURCES_PER_ITEM,
  nn,
  prepareTranslationQaInvalidation,
  prepareTranslationUpsert,
} from "./d1-bind.js";
import {
  buildMergePlan,
  clusterByTitleSimilarity,
  clusterSimilar,
  type ExistingCandidate,
  type MergeCandidate,
  type MergePlan,
  mergeClusters,
  unionSources,
} from "./dedupe.js";
import { enrichMissingContent, fetchOgData } from "./enrich.js";
import { sha256Hex } from "./hash.js";
import {
  scoreItems,
  setLlmCallLogger,
  TRANSLATE_BATCH_SIZE,
  translateItems,
  withLlmCallContext,
} from "./llm.js";
import { createD1LlmCallLogger, pruneLlmCalls } from "./llm-call-log.js";
import {
  buildMediaManifest,
  manifestWithoutArticleUrl,
  mergeMediaManifests,
  parseMediaManifest,
  primaryThumbnailUrl,
  serializeMediaManifest,
} from "./media.js";
import {
  assertMediaManifestSchema,
  isMediaManifestSchemaError,
} from "./media-schema.js";
import {
  dispatchStoryNotifications,
  type NotifyChannelReason,
} from "./notify/index.js";
import { rankScore } from "./ranking.js";
import {
  buildRunStats,
  type RunStepInfo,
  recordStep,
  serializeRunStats,
} from "./run-stats.js";
import { fetchStoryDetailByUrl } from "./sources/huggingnews.js";
import { adapters } from "./sources/registry.js";
import { ensureVendorBlogSources } from "./sources/seed.js";
import type { FetchedItem, FetchedItemSource } from "./sources/types.js";
import { reviewPendingSubmissions } from "./submissions.js";
import { sendDailyTldr } from "./subscribe/send.js";
import { reviewPendingSuggestions } from "./suggestions.js";
import { sanitizeError } from "./telemetry-safe.js";
import { toEpochSeconds } from "./time.js";
import { ensureDailyTldr } from "./tldr.js";
import { captureAndLearnTopics } from "./topic-learning.js";
import { MAX_MERGED_TOPICS, normalizeTopics, unionTopics } from "./topics.js";
import {
  ratePendingTranslations,
  TranslationReviewSchemaError,
} from "./translation-qa.js";
import type { Env } from "./types.js";
import {
  ingestRunId,
  jsonMap,
  mapEntries,
  persistOpenedWorkflowRun,
  persistWorkflowRun,
} from "./workflow-run.js";
import { llmStep, safeStep } from "./workflow-step.js";

const RELEVANCE_THRESHOLD = 0.4;
const RANK_RECOMPUTE_WINDOW_SEC = 72 * 60 * 60;
const SINCE_WINDOW_SEC = 26 * 60 * 60; // slight overlap over the hourly cron
// Same lookback the rank-recompute step uses: candidates for "same story as
// an already-published item" clustering.
const MERGE_LOOKBACK_SEC = RANK_RECOMPUTE_WINDOW_SEC;
// Bounds the clustering prompt's size; recent+highest-ranked first.
const MERGE_CANDIDATE_LIMIT = 300;

/** Backfill-translate slices already catch LLM failures. Default Workflow
 * retries (5 × 10 min) stacked 15 slices and left ingest instances running
 * past the next GitHub POST, so later runs never reached record-run. */
const BACKFILL_TRANSLATE_STEP = {
  retries: { limit: 0, delay: 0 },
  timeout: "2 minutes",
} as const;

/** Score / translate / merge / TL;DR / backfill-score. Same retry trap as
 * backfill-translate: a timed-out or exhausted LLM step must not retry for
 * ~50 minutes, or `record-run` never writes `workflow_runs`. */
const LLM_STEP = {
  retries: { limit: 0, delay: 0 },
  timeout: "4 minutes",
} as const;

const EMPTY_MERGE_PLAN: MergePlan = {
  merged: new Map(),
  canonicalUpdates: new Map(),
};

type SerializedMergePlan = {
  merged: [
    string,
    MergePlan["merged"] extends Map<string, infer V> ? V : never,
  ][];
  canonicalUpdates: [
    string,
    MergePlan["canonicalUpdates"] extends Map<string, infer V> ? V : never,
  ][];
};

function serializeMergePlan(plan: MergePlan): SerializedMergePlan {
  return {
    merged: mapEntries(plan.merged),
    canonicalUpdates: mapEntries(plan.canonicalUpdates),
  };
}

function restoreMergePlan(
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

interface SourceRow {
  id: string;
  type: string;
  config: string;
  enabled: number;
}

interface ItemRow {
  id: string;
  source_id: string;
  external_id: string | null;
  url: string;
  title: string;
  summary: string | null;
  published_at: number;
  fetched_at: number;
  points: number;
  comments: number;
  llm_relevance: number | null;
  llm_importance: number | null;
  llm_quality: number | null;
  category: string | null;
  tags: string;
  rank_score: number;
  status: string;
  media_manifest?: string | null;
}

export class NewsIngestWorkflow extends WorkflowEntrypoint<Env> {
  async run(event: WorkflowEvent<unknown>, step: WorkflowStep) {
    const runId = ingestRunId(event);
    return withLlmCallContext(runId, () =>
      this.runInternal(event, step, runId)
    );
  }

  private async runInternal(
    event: WorkflowEvent<unknown>,
    step: WorkflowStep,
    runId: string
  ) {
    let itemsFetched = 0;
    let itemsNew = 0;
    let runError: string | null = null;
    const bySource: Record<string, number> = {};
    let merged = 0;
    let published = 0;
    let rejected = 0;
    let scoreAndTranslateTokens = 0;
    let backfilledSummaries = 0;
    let backfilledTranslations = 0;
    let backfillTranslateTokens = 0;
    let qaRated = 0;
    let qaAdjusted = 0;
    let qaTokens = 0;
    let suggestionsReviewed = 0;
    let suggestionsTokens = 0;
    let submissionsReviewed = 0;
    let submissionsTokens = 0;
    let tldrGenerated = false;
    let tldrTokens = 0;
    let emailsSent = 0;
    let notified: Record<string, number> = {};
    let notifyReason: Record<string, NotifyChannelReason> = {};
    const steps: RunStepInfo[] = [];

    // POST /api/admin/ingest `{id}` is the Workflow instance id. Persist
    // that row before prune/fetch/LLM and before any step.do: create() can
    // return while run() is still queued, pruneLlmCalls can run for minutes
    // on a large llm_calls table, and wrapping the first step.do in
    // safeStep can return a fallback without executing the upsert.
    const startedAt = toEpochSeconds(
      event.timestamp instanceof Date ? event.timestamp.getTime() : Date.now()
    );
    await persistOpenedWorkflowRun(this.env.DB, runId, startedAt, "open-run");

    // Installs the D1-backed llm_calls logger so every scoreItems/
    // translateItems/generateTldr call below (and everything else that
    // routes through callAnyrouter) gets an observability row. Plain code,
    // not step.do: re-running it on workflow replay is harmless (it just
    // reinstalls the same closure and re-runs an idempotent DELETE), and
    // it must never affect run-error tracking below.
    //
    // This is only a default for LLM work that happens outside a step
    // callback: the Workflow engine can run a `step.do` callback in a
    // context where this module-level sink (and the run-id context above) is
    // gone, which silently no-ops `logLlmCall` and leaves the run with
    // tokens but zero attributable attempts. Every LLM-calling step below
    // therefore goes through `llmStep`, which re-installs the sink *inside*
    // the callback and drains the fire-and-forget inserts before the step
    // resolves. See workflow-step.ts.
    setLlmCallLogger(createD1LlmCallLogger(this.env, runId));

    // Durable duplicate of the open-run upsert. Do not wrap in safeStep:
    // a caught engine yield would skip the callback and look like success.
    await step.do("open-run", async () => {
      await persistOpenedWorkflowRun(this.env.DB, runId, startedAt, "open-run");
      return { id: runId, startedAt };
    });

    await pruneLlmCalls(this.env);

    try {
      await assertMediaManifestSchema(this.env.DB);
      const sources = await safeStep(step, "load-sources", [], async () => {
        await ensureVendorBlogSources(this.env.DB);
        const { results } = await this.env.DB.prepare(
          "SELECT id, type, config, enabled FROM sources WHERE enabled = 1"
        ).all<SourceRow>();
        return results ?? [];
      });

      const sinceEpochSec = Math.floor(Date.now() / 1000) - SINCE_WINDOW_SEC;
      const fetchedBySource: { source: SourceRow; items: FetchedItem[] }[] = [];

      const SOURCE_FETCH_GROUP = 4;
      for (let gi = 0; gi < sources.length; gi += SOURCE_FETCH_GROUP) {
        const group = sources.slice(gi, gi + SOURCE_FETCH_GROUP);
        const groupResults = await Promise.all(
          group.map((source) =>
            step
              .do<FetchedItem[]>(
                `fetch-${source.id}`,
                {
                  retries: { limit: 3, delay: 10_000, backoff: "exponential" },
                },
                async () => {
                  const adapter = adapters[source.type];
                  if (!adapter) return [];
                  const config = JSON.parse(source.config || "{}");
                  return adapter.fetchItems(config, sinceEpochSec);
                }
              )
              .catch((error: unknown) => {
                console.error(`fetch-${source.id} step failed:`, error);
                return [] as FetchedItem[];
              })
          )
        );
        for (let j = 0; j < group.length; j++) {
          const source = group[j];
          const items = groupResults[j];
          fetchedBySource.push({ source, items });
          itemsFetched += items.length;
          bySource[source.id] = (bySource[source.id] ?? 0) + items.length;
        }
      }
      recordStep(
        steps,
        "fetch",
        `${itemsFetched} items from ${sources.length} sources`
      );

      let newRows = await safeStep(
        step,
        "dedupe",
        [] as {
          id: string;
          source: SourceRow;
          item: FetchedItem;
        }[],
        async () => {
          const candidates: {
            id: string;
            source: SourceRow;
            item: FetchedItem;
          }[] = [];

          for (const { source, items } of fetchedBySource) {
            const hashed = await Promise.all(
              items.map(async (item) => ({
                id: await sha256Hex(item.url),
                source,
                item: {
                  ...item,
                  publishedAt: toEpochSeconds(item.publishedAt),
                },
              }))
            );
            candidates.push(...hashed);
          }

          const existingIds = new Set<string>();
          const DEDUPE_IN_CHUNK = 50;
          for (let i = 0; i < candidates.length; i += DEDUPE_IN_CHUNK) {
            const chunk = candidates.slice(i, i + DEDUPE_IN_CHUNK);
            if (chunk.length === 0) continue;
            const placeholders = chunk.map(() => "?").join(",");
            const { results } = await this.env.DB.prepare(
              `SELECT id FROM items WHERE id IN (${placeholders})`
            )
              .bind(...chunk.map((c) => c.id))
              .all<{ id: string }>();
            for (const row of results ?? []) existingIds.add(row.id);
          }

          const rows = candidates.filter((c) => !existingIds.has(c.id));

          // Rows inserted directly with status='new' (e.g. an accepted user
          // submission, or an admin push) never came through a source's
          // fetchItems() this run, so the loop above never sees them. Pull
          // them in here so they go through the same score/merge/translate
          // pipeline as anything freshly fetched.
          const { results: pendingNew } = await this.env.DB.prepare(
            `SELECT id, source_id, external_id, url, title, summary,
                  published_at, points, comments, image_url, source_lang, media_manifest
           FROM items WHERE status = 'new'`
          ).all<{
            id: string;
            source_id: string;
            external_id: string | null;
            url: string;
            title: string;
            summary: string | null;
            published_at: number;
            points: number;
            comments: number;
            image_url: string | null;
            source_lang: "en" | "vi";
            media_manifest: string | null;
          }>();
          for (const row of pendingNew ?? []) {
            const source = sources.find((s) => s.id === row.source_id) ?? {
              id: row.source_id,
              type: "unknown",
              config: "{}",
              enabled: 1,
            };
            rows.push({
              id: row.id,
              source,
              item: {
                externalId: row.external_id ?? undefined,
                url: row.url,
                title: row.title,
                summary: row.summary ?? undefined,
                publishedAt: row.published_at,
                points: row.points,
                comments: row.comments,
                imageUrl: row.image_url ?? undefined,
                sourceLang: row.source_lang,
                mediaManifest: parseMediaManifest(
                  row.media_manifest,
                  row.image_url
                ),
              },
            });
          }

          return rows;
        }
      );
      itemsNew = newRows.length;
      recordStep(
        steps,
        "dedupe",
        `${itemsNew} new`,
        `${Math.max(itemsFetched - itemsNew, 0)} already in db`
      );

      // Fill in summary/media for items lacking either, from the
      // article's own og/description meta tags, BEFORE scoring so the
      // scorer/translator get to see the enriched description. Runs against
      // scratch clones (not `newRows` directly) and returns only the plain
      // diff data: Workflow steps replay by returning their memoized value
      // rather than re-running the callback, so mutating `newRows` in place
      // here wouldn't survive a workflow restart — the fold-back below runs
      // as ordinary (replay-safe, deterministic) code outside the step.
      const enrichment = await safeStep(
        step,
        "enrich",
        [] as {
          id: string;
          summary?: string;
          imageUrl?: string;
          mediaManifest?: FetchedItem["mediaManifest"];
        }[],
        async () => {
          if (newRows.length === 0) return [];
          const drafts = newRows.map((row) => ({ ...row.item }));
          await enrichMissingContent(drafts);
          return newRows.map((row, i) => ({
            id: row.id,
            summary: drafts[i].summary,
            imageUrl: drafts[i].imageUrl,
            mediaManifest: drafts[i].mediaManifest,
          }));
        }
      );
      const enrichmentById = new Map(enrichment.map((e) => [e.id, e]));
      newRows = newRows.map((row) => {
        const e = enrichmentById.get(row.id);
        if (!e) return row;
        return {
          ...row,
          item: {
            ...row.item,
            summary: e.summary ?? row.item.summary,
            imageUrl: e.imageUrl ?? row.item.imageUrl,
            mediaManifest: e.mediaManifest ?? row.item.mediaManifest,
          },
        };
      });

      const scored = jsonMap(
        await llmStep(
          step,
          this.env,
          runId,
          "score",
          [] as [string, Awaited<ReturnType<typeof scoreItems>>[number]][],
          async () => {
            if (newRows.length === 0) return [];
            try {
              const results = await scoreItems(
                this.env,
                newRows.map((row, i) => ({
                  i,
                  // Decision identity: lets the optional JEV panel key its
                  // idempotency to this item inside this run.
                  id: row.id,
                  title: row.item.title,
                  summary: row.item.summary,
                  source: row.source.id,
                }))
              );
              const map = new Map<string, (typeof results)[number]>();
              for (const result of results) {
                const row = newRows[result.i];
                if (row) map.set(row.id, result);
              }
              return mapEntries(map);
            } catch (error) {
              console.error("score step failed:", error);
              return [];
            }
          },
          LLM_STEP
        )
      );
      recordStep(
        steps,
        "score",
        newRows.length === 0 ? "skipped" : `scored ${scored.size} items`,
        newRows.length === 0 ? "no new items" : undefined
      );

      const now = Date.now();

      // Rewrites each item's raw score tags into canonical topic names
      // (rules-based first, LLM-mapped for unseen variants), persisting
      // the `topics` table's per-variant counts. Runs before merge-similar
      // so a cluster's topic union already has canonical values to
      // dedupe against.
      const canonicalTagsByItem = jsonMap(
        await llmStep(
          step,
          this.env,
          runId,
          "normalize-topics",
          [] as [string, string[]][],
          async () => {
            if (newRows.length === 0) return [];
            try {
              const rawTagsByItem = new Map<string, string[]>(
                newRows.map((row) => [row.id, scored.get(row.id)?.tags ?? []])
              );
              return mapEntries(
                await normalizeTopics(this.env, rawTagsByItem, now)
              );
            } catch (error) {
              console.error("normalize-topics step failed:", error);
              return [];
            }
          },
          LLM_STEP
        )
      );

      // Capture per-day topic frequencies and promote emerging entity /
      // model tags into learned_keywords for title highlight + trending.
      await safeStep(step, "learn-topics", undefined, async () => {
        if (canonicalTagsByItem.size === 0) return;
        try {
          const titlesByItem = new Map(
            newRows.map((row) => [row.id, row.item.title])
          );
          const { promoted } = await captureAndLearnTopics(
            this.env.DB,
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

      const mergePlan = restoreMergePlan(
        await llmStep(
          step,
          this.env,
          runId,
          "merge-similar",
          serializeMergePlan(EMPTY_MERGE_PLAN),
          async () => {
            if (newRows.length === 0)
              return serializeMergePlan(EMPTY_MERGE_PLAN);
            try {
              const { results: recentForClustering } =
                await this.env.DB.prepare(
                  `SELECT id, title, points, comments, image_url, media_manifest FROM items
           WHERE status = 'published' AND published_at >= ?
           ORDER BY published_at DESC
           LIMIT ${MERGE_CANDIDATE_LIMIT}`
                )
                  .bind(toEpochSeconds(now) - MERGE_LOOKBACK_SEC)
                  .all<{
                    id: string;
                    title: string;
                    points: number;
                    comments: number;
                    image_url: string | null;
                    media_manifest: string | null;
                  }>();

              const newForCluster = newRows.map((row, i) => ({
                i,
                title: row.item.title,
                url: row.item.url,
                source: row.source.id,
              }));
              const existingForCluster = (recentForClustering ?? []).map(
                (r) => ({
                  id: r.id,
                  title: r.title,
                })
              );
              const llmClusters = await clusterSimilar(
                this.env,
                newForCluster,
                existingForCluster
              );
              const titleClusters = clusterByTitleSimilarity(
                newForCluster,
                existingForCluster
              );
              const clusters = mergeClusters([llmClusters, titleClusters]);
              if (clusters.length === 0) return EMPTY_MERGE_PLAN;

              const candidates: MergeCandidate[] = newRows.map((row, i) => {
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

              const existingById = new Map<string, ExistingCandidate>(
                (recentForClustering ?? []).map((r) => [
                  r.id,
                  {
                    points: r.points,
                    comments: r.comments,
                    imageUrl: r.image_url,
                    mediaManifest: parseMediaManifest(
                      r.media_manifest,
                      r.image_url
                    ),
                  },
                ])
              );

              return serializeMergePlan(
                buildMergePlan(
                  clusters,
                  candidates,
                  existingById,
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

      const newRowById = new Map(newRows.map((row) => [row.id, row]));

      const publishedRows = newRows.filter((row) => {
        if (mergePlan.merged.has(row.id)) return false; // skip translate for merged items
        const score = scored.get(row.id);
        return !score || score.relevance >= RELEVANCE_THRESHOLD;
      });

      const translated = jsonMap(
        await llmStep(
          step,
          this.env,
          runId,
          "translate",
          [] as [string, Awaited<ReturnType<typeof translateItems>>[number]][],
          async () => {
            if (publishedRows.length === 0) return [];
            try {
              const results = await translateItems(
                this.env,
                publishedRows.map((row, i) => ({
                  i,
                  title: row.item.title,
                  summary: row.item.summary,
                  sourceLang: row.item.sourceLang ?? "en",
                }))
              );
              const map = new Map<string, (typeof results)[number]>();
              for (const result of results) {
                const row = publishedRows[result.i];
                if (row) map.set(row.id, result);
              }
              return mapEntries(map);
            } catch (error) {
              console.error("translate step failed:", error);
              return [];
            }
          },
          LLM_STEP
        )
      );
      recordStep(
        steps,
        "translate",
        publishedRows.length === 0
          ? "skipped"
          : `translated ${translated.size}/${publishedRows.length} items`,
        publishedRows.length === 0
          ? newRows.length === 0
            ? "no new items"
            : "no items cleared the relevance threshold"
          : translated.size === 0
            ? "translateItems.batch_failed — title_vi left empty (EN badge) until backfill"
            : translated.size < publishedRows.length
              ? `partial ${translated.size}/${publishedRows.length}`
              : undefined
      );

      // Plain deterministic derivation from already-memoized step outputs
      // (newRows/scored/mergePlan/translated) — replay-safe the same way
      // publishedRows above is, no need for its own step.do.
      merged = mergePlan.merged.size;
      published = publishedRows.length;
      rejected = newRows.length - merged - published;
      for (const score of scored.values())
        scoreAndTranslateTokens += score.tokens;
      for (const translation of translated.values())
        scoreAndTranslateTokens += translation.tokens;

      await safeStep(
        step,
        "write-d1",
        undefined,
        async () => {
          const statements: D1PreparedStatement[] = [];

          for (const { id, source, item } of newRows) {
            const score = scored.get(id);
            const translation = translated.get(id);
            const mergeEntry = mergePlan.merged.get(id);
            const canonicalUpdate = mergePlan.canonicalUpdates.get(id);

            // A canonical new item absorbs the rest of its cluster's
            // points/comments (max) and sources (union, capped) before
            // its own row is written.
            const currentThumbnail = primaryThumbnailUrl(
              item.mediaManifest,
              item.imageUrl,
              item.url
            );
            const extraMedia =
              canonicalUpdate && !canonicalUpdate.isExisting
                ? (canonicalUpdate.extraMedia ?? [])
                : [];
            const extraLegacyImages =
              canonicalUpdate &&
              !canonicalUpdate.isExisting &&
              !currentThumbnail
                ? (canonicalUpdate.extraImageUrls ?? []).map((url) => ({
                    type: "image" as const,
                    url,
                  }))
                : [];
            const combinedMedia = manifestWithoutArticleUrl(
              mergeMediaManifests(item.mediaManifest, {
                version: 1,
                assets: [...extraMedia, ...extraLegacyImages],
              }),
              item.url
            );
            const effectiveItem = {
              ...item,
              mediaManifest: combinedMedia,
              imageUrl:
                primaryThumbnailUrl(combinedMedia, item.imageUrl, item.url) ??
                undefined,
              ...(canonicalUpdate && !canonicalUpdate.isExisting
                ? {
                    points: canonicalUpdate.maxPoints,
                    comments: canonicalUpdate.maxComments,
                    sources: unionSources(
                      item.sources ?? [],
                      canonicalUpdate.extraSources,
                      MAX_SOURCES_PER_ITEM
                    ),
                  }
                : {}),
            };

            // Canonical topics (rules-normalized + LLM-mapped by
            // normalize-topics), unioned with the rest of the cluster's
            // topics for a new-item canonical so counts don't fragment
            // across near-duplicate stories.
            const canonicalTopics =
              canonicalUpdate && !canonicalUpdate.isExisting
                ? unionTopics(
                    canonicalTagsByItem.get(id) ?? [],
                    canonicalUpdate.extraTopics,
                    MAX_MERGED_TOPICS
                  )
                : (canonicalTagsByItem.get(id) ?? []);
            const effectiveScore = score
              ? { ...score, tags: canonicalTopics }
              : undefined;

            const relevance = score?.relevance ?? 0.5;
            const importance = score?.importance ?? 5;
            const quality = score?.quality ?? 5;
            const status = mergeEntry
              ? "merged"
              : relevance < RELEVANCE_THRESHOLD
                ? "rejected"
                : "published";
            const rank = rankScore({
              importance,
              quality,
              points: effectiveItem.points ?? 0,
              comments: effectiveItem.comments ?? 0,
              // item.publishedAt is epoch seconds (normalized at dedupe time);
              // rankScore's decay formula operates in milliseconds.
              publishedAt: effectiveItem.publishedAt * 1000,
              now,
              sourceCount: effectiveItem.sources?.length ?? 0,
            });
            const llmTokens = (score?.tokens ?? 0) + (translation?.tokens ?? 0);

            statements.push(
              this.env.DB.prepare(
                `INSERT INTO items (
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
                media_manifest = excluded.media_manifest`
              ).bind(
                ...buildItemBindArgs({
                  id,
                  sourceId: source.id,
                  item: effectiveItem,
                  score: effectiveScore,
                  rank,
                  status,
                  now,
                  llmTokens,
                  duplicateOf: mergeEntry?.duplicateOf,
                })
              )
            );

            // The translate step can be skipped (empty batch result) or the
            // LLM can omit a field entirely; only insert when both are usable.
            // Explicit VI source items are stored as title_vi so the homepage
            // does not paint an EN badge; no text heuristic chooses direction.
            // Persist VI titles only for published items — rejected/merged
            // rows must not create translations entries (native or LLM).
            const nativeViTitle =
              item.sourceLang === "vi" && !translation?.title
                ? {
                    title: item.title.trim(),
                    summary: item.summary?.trim() ?? "",
                  }
                : null;
            const persisted =
              status === "published"
                ? translation?.title
                  ? {
                      title: translation.title,
                      summary: translation.summary ?? "",
                    }
                  : nativeViTitle
                : null;
            if (persisted) {
              statements.push(
                prepareTranslationUpsert(this.env.DB, {
                  id,
                  lang: "vi",
                  sourceLang: item.sourceLang ?? "en",
                  targetLang: "vi",
                  title: persisted.title,
                  summary: persisted.summary,
                })
              );
            }

            // Merged items' sources have already been absorbed into their
            // canonical's item_sources rows; don't also write their own.
            if (
              !mergeEntry &&
              effectiveItem.sources &&
              effectiveItem.sources.length > 0
            ) {
              statements.push(
                this.env.DB.prepare(
                  "DELETE FROM item_sources WHERE item_id = ?"
                ).bind(nn(id))
              );
              for (const row of buildItemSourceBindArgs(
                id,
                effectiveItem.sources
              )) {
                statements.push(
                  this.env.DB.prepare(
                    `INSERT INTO item_sources (item_id, position, kind, author, posted_at, quote, url)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`
                  ).bind(...row)
                );
              }
            }
          }

          // Canonicals that are pre-existing (already-published) items absorb
          // the merged new items' points/comments/sources too, but need their
          // own read-update-write since they're not part of `newRows`.
          for (const [canonicalId, update] of mergePlan.canonicalUpdates) {
            if (!update.isExisting || newRowById.has(canonicalId)) continue;

            const existingTagsRow = await this.env.DB.prepare(
              "SELECT tags, url, image_url, media_manifest FROM items WHERE id = ?"
            )
              .bind(canonicalId)
              .first<{
                tags: string | null;
                url: string;
                image_url: string | null;
                media_manifest: string | null;
              }>();
            let existingTopics: string[] = [];
            try {
              const parsed = JSON.parse(existingTagsRow?.tags ?? "[]");
              if (Array.isArray(parsed)) existingTopics = parsed;
            } catch {
              // malformed existing tags JSON — treat as empty, union still works
            }
            const mergedTopics = unionTopics(
              existingTopics,
              update.extraTopics,
              MAX_MERGED_TOPICS
            );

            const existingManifest = manifestWithoutArticleUrl(
              parseMediaManifest(
                existingTagsRow?.media_manifest,
                existingTagsRow?.image_url
              ),
              existingTagsRow?.url
            );
            const incomingMedia = buildMediaManifest(update.extraMedia ?? []);
            const hasIncomingThumbnail = Boolean(
              primaryThumbnailUrl(incomingMedia)
            );
            const existingThumbnail = primaryThumbnailUrl(
              existingManifest,
              existingTagsRow?.image_url,
              existingTagsRow?.url
            );
            const extraLegacyImages =
              !existingThumbnail && !hasIncomingThumbnail
                ? (update.extraImageUrls ?? []).map((url) => ({
                    type: "image" as const,
                    url,
                  }))
                : [];
            const mergedManifest = manifestWithoutArticleUrl(
              mergeMediaManifests(existingManifest, {
                version: 1,
                assets: [...(incomingMedia.assets ?? []), ...extraLegacyImages],
              }),
              existingTagsRow?.url
            );
            const mergedImageUrl = primaryThumbnailUrl(
              mergedManifest,
              existingTagsRow?.image_url,
              existingTagsRow?.url
            );

            statements.push(
              this.env.DB.prepare(
                `UPDATE items SET
                 points = ?, comments = ?, tags = ?, image_url = ?,
                 media_manifest = ?
               WHERE id = ?`
              ).bind(
                nn(update.maxPoints),
                nn(update.maxComments),
                nn(JSON.stringify(mergedTopics)),
                nn(mergedImageUrl),
                serializeMediaManifest(mergedManifest),
                nn(canonicalId)
              )
            );

            const { results: existingSourceRows } = await this.env.DB.prepare(
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
              MAX_SOURCES_PER_ITEM
            );

            statements.push(
              this.env.DB.prepare(
                "DELETE FROM item_sources WHERE item_id = ?"
              ).bind(nn(canonicalId))
            );
            for (const row of buildItemSourceBindArgs(
              canonicalId,
              mergedSources
            )) {
              statements.push(
                this.env.DB.prepare(
                  `INSERT INTO item_sources (item_id, position, kind, author, posted_at, quote, url)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
                ).bind(...row)
              );
            }
          }

          // Only the current UTC day is re-ranked: the feed groups and sorts
          // stories per day, so recomputing freshness decay on older items
          // reshuffles history the reader already saw. Once a day rolls over,
          // its order is frozen; past days only ever gain merged-away dupes.
          const startOfUtcDaySec =
            Math.floor(toEpochSeconds(now) / 86400) * 86400;
          const { results: recentItems } = await this.env.DB.prepare(
            "SELECT id, published_at, points, comments, llm_importance, llm_quality FROM items WHERE published_at >= ? AND status = 'published'"
          )
            .bind(startOfUtcDaySec)
            .all<
              Pick<
                ItemRow,
                | "id"
                | "published_at"
                | "points"
                | "comments"
                | "llm_importance"
                | "llm_quality"
              >
            >();

          for (const row of recentItems ?? []) {
            const rank = rankScore({
              importance: row.llm_importance ?? 5,
              quality: row.llm_quality ?? 5,
              points: row.points,
              comments: row.comments,
              // row.published_at is stored as epoch seconds; rankScore expects ms.
              publishedAt: row.published_at * 1000,
              now,
            });
            statements.push(
              this.env.DB.prepare(
                "UPDATE items SET rank_score = ? WHERE id = ?"
              ).bind(nn(rank), nn(row.id))
            );
          }

          if (statements.length > 0) {
            await this.env.DB.batch(statements);
          }
        },
        undefined,
        true
      );

      // Backfills existing (pre-enrichment) published items still missing a
      // summary. Drains the backlog a few items per hourly run rather than
      // trying to catch up all at once.
      backfilledSummaries = await safeStep(
        step,
        "backfill-content",
        0,
        async () => {
          let backfilled = 0;
          try {
            const { results } = await this.env.DB.prepare(
              buildMissingSummaryQuery(BACKFILL_CONTENT_CAP)
            ).all<{
              id: string;
              url: string;
              source_id: string;
              summary: string | null;
              image_url: string | null;
              media_manifest: string | null;
            }>();
            const rows = results ?? [];
            const mediaOnlyRows = await this.env.DB.prepare(
              buildMissingMediaQuery(BACKFILL_CONTENT_CAP)
            ).all<{
              id: string;
              url: string;
              source_id: string;
              summary: string;
              image_url: string | null;
              media_manifest: string | null;
            }>();
            const mediaRows = mediaOnlyRows.results ?? [];
            const allRows = [...rows, ...mediaRows].filter(
              (row, index, list) =>
                list.findIndex((candidate) => candidate.id === row.id) === index
            );

            for (let i = 0; i < allRows.length; i += BACKFILL_BATCH_SIZE) {
              const batch = allRows.slice(i, i + BACKFILL_BATCH_SIZE);
              await Promise.all(
                batch.map(async (row) => {
                  let fetched: {
                    summary?: string;
                    imageUrl?: string;
                    mediaManifest?: FetchedItem["mediaManifest"];
                  };
                  let sources: FetchedItemSource[] = [];

                  if (row.source_id === "huggingnews") {
                    const detail = await fetchStoryDetailByUrl(
                      huggingNewsDetailUrl(row.url)
                    );
                    fetched = { summary: detail.summary };
                    sources = detail.sources;
                  } else {
                    const og = await fetchOgData(row.url);
                    fetched = {
                      summary: og.description,
                      imageUrl: og.imageUrl,
                      mediaManifest: og.mediaManifest,
                    };
                  }

                  const plan = planBackfillUpdate(
                    {
                      summary: row.summary,
                      imageUrl: row.image_url,
                      mediaManifest: row.media_manifest,
                      articleUrl: row.url,
                    },
                    fetched
                  );
                  if (!plan) return;
                  backfilled++;

                  await this.env.DB.prepare(
                    `UPDATE items SET
                       summary = COALESCE(?, summary),
                       image_url = ?,
                       media_manifest = ?
                     WHERE id = ?`
                  )
                    .bind(
                      nn(plan.summary),
                      nn(plan.imageUrl),
                      serializeMediaManifest(plan.mediaManifest),
                      nn(row.id)
                    )
                    .run();
                  await prepareTranslationQaInvalidation(
                    this.env.DB,
                    row.id
                  ).run();

                  if (sources.length === 0) return;
                  const { results: existingSources } =
                    await this.env.DB.prepare(
                      "SELECT 1 FROM item_sources WHERE item_id = ? LIMIT 1"
                    )
                      .bind(row.id)
                      .all();
                  if ((existingSources ?? []).length > 0) return;

                  for (const sourceArgs of buildItemSourceBindArgs(
                    row.id,
                    sources
                  )) {
                    await this.env.DB.prepare(
                      `INSERT INTO item_sources (item_id, position, kind, author, posted_at, quote, url)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`
                    )
                      .bind(...sourceArgs)
                      .run();
                  }
                })
              );
            }
          } catch (error) {
            if (isMediaManifestSchemaError(error)) throw error;
            console.error("backfill-content step failed:", error);
          }
          return backfilled;
        },
        undefined,
        true
      );
      recordStep(
        steps,
        "backfill-content",
        backfilledSummaries === 0
          ? "0 candidates backfilled"
          : `backfilled ${backfilledSummaries} summaries`
      );

      // Translates whatever summaries exist (including ones the step above
      // just backfilled) but don't have a Vietnamese translation yet.
      // Load once, then one durable step per 3-item slice so a successful
      // batch is checkpointed even if a later slice times out.
      const missingTranslations = await safeStep(
        step,
        "backfill-translate-load",
        [] as {
          id: string;
          title: string;
          summary: string;
          source_lang: string;
        }[],
        async () => {
          const { results } = await this.env.DB.prepare(
            buildMissingTranslationQuery()
          ).all<{
            id: string;
            title: string;
            summary: string;
            source_lang: string;
          }>();
          return results ?? [];
        }
      );
      const backfillTranslateAttempted = missingTranslations.length;
      {
        let translatedCount = 0;
        let tokens = 0;
        for (
          let offset = 0;
          offset < missingTranslations.length;
          offset += TRANSLATE_BATCH_SIZE
        ) {
          let part = { count: 0, tokens: 0 };
          try {
            part = await llmStep(
              step,
              this.env,
              runId,
              `backfill-translate-${offset}`,
              { count: 0, tokens: 0 },
              async () => {
                const rows = missingTranslations.slice(
                  offset,
                  offset + TRANSLATE_BATCH_SIZE
                );
                let count = 0;
                let partTokens = 0;
                try {
                  const translated = await translateItems(
                    this.env,
                    rows.map((row, i) => ({
                      i,
                      title: row.title,
                      summary: row.summary,
                      sourceLang: row.source_lang === "vi" ? "vi" : "en",
                    }))
                  );
                  for (const result of translated) {
                    partTokens += result.tokens;
                    const row = rows[result.i];
                    if (!row || !result.title) continue;
                    await prepareTranslationUpsert(this.env.DB, {
                      id: row.id,
                      lang: "vi",
                      sourceLang: row.source_lang === "vi" ? "vi" : "en",
                      targetLang: "vi",
                      title: result.title,
                      summary: result.summary ?? "",
                    }).run();
                    count++;
                  }
                } catch (error) {
                  console.error("backfill-translate batch failed:", error);
                }
                return { count, tokens: partTokens };
              },
              BACKFILL_TRANSLATE_STEP
            );
          } catch (error) {
            console.error(`backfill-translate-${offset} step failed:`, error);
          }
          translatedCount += part.count;
          tokens += part.tokens;
        }
        backfilledTranslations = translatedCount;
        backfillTranslateTokens = tokens;
      }
      recordStep(
        steps,
        "backfill-translate",
        backfilledTranslations === 0
          ? backfillTranslateAttempted === 0
            ? "0 candidates"
            : `translated 0/${backfillTranslateAttempted}`
          : `translated ${backfilledTranslations} summaries`,
        backfillTranslateAttempted > 0 && backfilledTranslations === 0
          ? "translateItems.batch_failed — missing title_vi not backfilled"
          : undefined
      );

      const backfillScoreResult = await llmStep(
        step,
        this.env,
        runId,
        "backfill-score",
        { scoredCount: 0, tokens: 0 },
        async () => {
          let scoredCount = 0;
          let tokens = 0;
          try {
            const { results } = await this.env.DB.prepare(
              buildUnscoredItemsQuery(BACKFILL_SCORE_CAP)
            ).all<{
              id: string;
              title: string;
              summary: string | null;
              source_id: string;
              points: number;
              comments: number;
              published_at: number;
            }>();
            const rows = results ?? [];
            if (rows.length === 0) return { scoredCount, tokens };

            const scoredRows = await scoreItems(
              this.env,
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
            const canonical = await normalizeTopics(
              this.env,
              rawTagsByItem,
              Date.now()
            );
            const now = Date.now();
            for (const result of scoredRows) {
              const row = rows[result.i];
              if (!row) continue;
              const tags = canonical.get(row.id) ?? result.tags;
              const rank = rankScore({
                importance: result.importance,
                quality: result.quality,
                points: row.points ?? 0,
                comments: row.comments ?? 0,
                publishedAt: row.published_at * 1000,
                now,
              });
              await this.env.DB.prepare(
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
      scoreAndTranslateTokens += backfillScoreResult.tokens;
      recordStep(
        steps,
        "backfill-score",
        backfillScoreResult.scoredCount === 0
          ? "0 candidates"
          : `scored ${backfillScoreResult.scoredCount} items`
      );

      const qaStats = await llmStep(
        step,
        this.env,
        runId,
        "qa-translations",
        { rated: 0, adjusted: 0, tokens: 0, error: "" },
        async () => {
          try {
            return await ratePendingTranslations(this.env);
          } catch (error) {
            if (error instanceof TranslationReviewSchemaError) {
              return {
                rated: 0,
                adjusted: 0,
                tokens: 0,
                error: "schema missing; apply migration 0023",
              };
            }
            console.error("qa-translations step failed");
            return { rated: 0, adjusted: 0, tokens: 0, error: "review failed" };
          }
        },
        LLM_STEP
      );
      qaRated = qaStats.rated;
      qaAdjusted = qaStats.adjusted;
      qaTokens = qaStats.tokens;
      recordStep(
        steps,
        "qa-translations",
        "error" in qaStats && qaStats.error
          ? qaStats.error
          : qaRated === 0
            ? "0 pending translations"
            : `rated ${qaRated} translations, adjusted ${qaAdjusted}`
      );

      const suggestionsStats = await llmStep(
        step,
        this.env,
        runId,
        "review-suggestions",
        { reviewed: 0, tokens: 0 },
        async () => {
          try {
            return await reviewPendingSuggestions(this.env);
          } catch (error) {
            console.error("review-suggestions step failed:", error);
            return { reviewed: 0, tokens: 0 };
          }
        }
      );
      suggestionsReviewed = suggestionsStats.reviewed;
      suggestionsTokens = suggestionsStats.tokens;
      recordStep(
        steps,
        "review-suggestions",
        suggestionsReviewed === 0
          ? "0 pending suggestions"
          : `reviewed ${suggestionsReviewed} suggestions`
      );

      const submissionsStats = await llmStep(
        step,
        this.env,
        runId,
        "review-submissions",
        { reviewed: 0, tokens: 0 },
        async () => {
          try {
            return await reviewPendingSubmissions(this.env);
          } catch (error) {
            if (isMediaManifestSchemaError(error)) throw error;
            console.error("review-submissions step failed:", error);
            return { reviewed: 0, tokens: 0 };
          }
        }
      );
      submissionsReviewed = submissionsStats.reviewed;
      submissionsTokens = submissionsStats.tokens;
      recordStep(
        steps,
        "review-submissions",
        submissionsReviewed === 0
          ? "0 pending submissions"
          : `reviewed ${submissionsReviewed} submissions`
      );

      const tldrStats = await llmStep(
        step,
        this.env,
        runId,
        "tldr",
        {
          generated: false,
          tokens: 0,
          reason: "tldr step failed",
        },
        async () => {
          try {
            return await ensureDailyTldr(this.env);
          } catch (error) {
            console.error("tldr step failed:", error);
            return {
              generated: false,
              tokens: 0,
              reason: sanitizeError(error)?.message ?? "tldr failed",
            };
          }
        },
        LLM_STEP
      );
      tldrGenerated = tldrStats.generated;
      tldrTokens = tldrStats.tokens;
      recordStep(
        steps,
        "tldr",
        tldrGenerated ? "generated" : "skipped",
        tldrStats.reason
      );

      emailsSent = await safeStep(step, "email-digest", 0, async () => {
        try {
          return await sendDailyTldr(this.env);
        } catch (error) {
          // Never let a digest-send failure break the ingest workflow.
          console.error("email-digest step failed:", error);
          return 0;
        }
      });
      recordStep(
        steps,
        "email",
        emailsSent === 0 ? "skipped" : `sent to ${emailsSent} subscribers`,
        emailsSent === 0 ? "no eligible subscribers this run" : undefined
      );

      const notifyResult = await safeStep(
        step,
        "notify",
        {
          sent: {} as Record<string, number>,
          reasons: {} as Record<string, NotifyChannelReason>,
        },
        async () => dispatchStoryNotifications(this.env),
        undefined,
        true
      );
      notified = notifyResult.sent;
      notifyReason = notifyResult.reasons;
      const notifiedTotal = Object.values(notified).reduce((a, b) => a + b, 0);
      recordStep(
        steps,
        "notify",
        notifiedTotal === 0
          ? "skipped"
          : Object.entries(notified)
              .map(([channel, n]) => `${channel}: ${n}`)
              .join(", "),
        JSON.stringify(notifyReason)
      );
    } catch (error) {
      // Do not rethrow. Cloudflare Workflows retry a thrown `run()` (and
      // skip later steps, including `record-run` in this finally). A
      // finished ingest must always insert a workflow_runs row so
      // /api/system lastRun/runsToday move.
      runError = sanitizeError(error)?.message ?? "ingest run failed";
      console.error("ingest run failed:", error);
    } finally {
      recordStep(steps, "close-run", "recording");
      const stats = buildRunStats({
        bySource,
        steps,
        new: itemsNew,
        merged,
        rejected,
        published,
        tokens:
          scoreAndTranslateTokens +
          backfillTranslateTokens +
          qaTokens +
          suggestionsTokens +
          submissionsTokens +
          tldrTokens,
        backfilledSummaries,
        backfilledTranslations,
        qaRated,
        qaAdjusted,
        suggestionsReviewed,
        submissionsReviewed,
        tldrGenerated,
        emailsSent,
        notified,
        notifyReason,
      });

      const row = {
        id: runId,
        startedAt,
        finishedAt: toEpochSeconds(Date.now()),
        itemsFetched,
        itemsNew,
        error: runError,
        statsJson: serializeRunStats(stats),
      };

      // Durable close so a replay still writes. Direct D1 in finally is a
      // fallback when the engine will not schedule another step.do.
      try {
        await safeStep(
          step,
          "close-run",
          undefined,
          async () => {
            await persistWorkflowRun(this.env.DB, row);
          },
          LLM_STEP
        );
      } catch (error) {
        console.error("close-run step failed:", error);
      }
      try {
        await persistWorkflowRun(this.env.DB, row);
      } catch (error) {
        console.error("close-run d1 failed:", error);
      }
    }
  }
}
