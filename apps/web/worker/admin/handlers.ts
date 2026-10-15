import { parseArchiveDate } from "../../src/lib/day-archive.js";
import {
  DAY_VIDEO_POST_CHANNELS,
  DAY_VIDEO_TITLE_MAX,
  type DayVideoPostChannel,
  isDayVideoPostChannel,
  parseYoutubeId,
} from "../../src/lib/day-video.js";
import type { Lang } from "../../src/lib/types.js";
import {
  prepareItemContentChangeLog,
  prepareLoggedTranslationUpsert,
  prepareTranslationQaInvalidation,
} from "../d1-bind.js";
import { sha256Hex } from "../hash.js";
import { validateIngestMode } from "../ingest/mode.js";
import { tickIngest } from "../ingest-schedule.js";
import {
  scoreItems,
  setLlmCallLogger,
  translateItems,
  withLlmCallContext,
} from "../llm.js";
import { createD1LlmCallLogger, flushLlmCallWrites } from "../llm-call-log.js";
import { forceSendDigest, syncDigestVideoButton } from "../notify/index.js";
import { sendDayVideoToTelegram, telegramChatId } from "../notify/telegram.js";
import {
  RANK_SIGNAL_COLUMNS,
  RANK_SIGNAL_JOIN,
  type RankSignalRow,
  rankScore,
  rowRankSignals,
} from "../ranking.js";
import { adapters } from "../sources/registry.js";
import type { SourceLanguage } from "../sources/types.js";
import {
  applyTagBackfill,
  loadTagBackfill,
  planTagBackfill,
  type TagBackfillPlan,
} from "../tag-backfill.js";
import {
  safeErrorCode,
  safeErrorStatus,
  sanitizeError,
  sanitizeRunStats,
} from "../telemetry-safe.js";
import { toEpochSeconds } from "../time.js";
import {
  buildTopItemsQuery,
  previewDailyTldr,
  regenerateDailyTldr,
  type TldrPreview,
  type TldrRegenerateResult,
  tldrSnapshotDate,
} from "../tldr.js";
import { captureAndLearnTopics } from "../topic-learning.js";
import { normalizeTopics, type ScoredStoryTags } from "../topics.js";
import type { Env } from "../types.js";
import { applyUnmerge, type BatchResult } from "../unmerge/apply.js";
import {
  d1Select,
  loadDanglingSnapshot,
  loadUnmergeSnapshot,
} from "../unmerge/load.js";
import {
  parseDanglingDecisions,
  parseUnmergePairs,
  planDanglingUnmerge,
  planUnmerge,
  type UnmergePlan,
  unknownDecisionIds,
} from "../unmerge/plan.js";
import { countUnmerge, type UnmergeCounts } from "../unmerge/report.js";
import {
  applyUndo,
  loadUndo,
  parseBatchId,
  planUndo,
  type UndoPlan,
} from "../unmerge/undo.js";
import { SELECT_RECENT_WORKFLOW_RUNS_SQL } from "../workflow-run.js";

export async function writeAudit(
  env: Env,
  action: string,
  detail?: string
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)"
    )
      .bind(Date.now(), action, detail ?? null)
      .run();
  } catch {
    // table not migrated yet
  }
}

export interface HandlerError {
  error: string;
  status?: number;
}

export function isHandlerError(value: unknown): value is HandlerError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

export interface PushItemInput {
  url: string;
  title: string;
  summary?: string;
  source_id?: string;
  /**
   * Epoch seconds, the unit of `items.published_at`. Callers may pass
   * milliseconds; `toEpochSeconds` accepts both. Defaults to now.
   */
  published_at?: number;
  points?: number;
  comments?: number;
  category?: string;
  tags?: string[];
  title_vi?: string;
  summary_vi?: string;
  relevance?: number;
  importance?: number;
  quality?: number;
  source_lang?: SourceLanguage;
}

export interface PushItemsResult {
  inserted: number;
  updated: number;
  ids: string[];
}

/**
 * Upserts one or more externally-pushed items into `items` (and, when a
 * Vietnamese title is supplied, `translations`). Pushed items default to
 * source_id 'push' and status 'new' unless a score field (relevance /
 * importance / quality) is supplied, in which case they are considered
 * pre-scored and marked 'published' directly.
 *
 * Note: items inserted this way are *not* picked up by the hourly
 * workflow's scoring pass — its dedupe step skips ids that already exist
 * in `items`. A 'new' status pushed item keeps rank_score 0 until scored
 * by a future push or manual update. This is an accepted limitation.
 */
export async function pushItems(
  env: Env,
  itemsInput: PushItemInput | PushItemInput[]
): Promise<PushItemsResult | HandlerError> {
  const items = Array.isArray(itemsInput) ? itemsInput : [itemsInput];

  if (items.length === 0) {
    return { error: "no items provided", status: 400 };
  }
  for (const item of items) {
    if (
      !item ||
      typeof item.url !== "string" ||
      item.url.length === 0 ||
      typeof item.title !== "string" ||
      item.title.length === 0 ||
      (item.source_lang !== undefined &&
        item.source_lang !== "en" &&
        item.source_lang !== "vi")
    ) {
      return {
        error:
          "each item requires a non-empty url/title and source_lang must be en or vi",
        status: 400,
      };
    }
  }

  const now = Date.now();
  const ids: string[] = [];
  let inserted = 0;
  let updated = 0;

  for (const item of items) {
    const id = await sha256Hex(item.url);
    ids.push(id);

    const sourceId = item.source_id ?? "push";
    const hasScore =
      item.relevance !== undefined ||
      item.importance !== undefined ||
      item.quality !== undefined;
    const status = hasScore ? "published" : "new";
    const publishedAt = toEpochSeconds(item.published_at ?? Date.now());

    const existing = await env.DB.prepare(
      `SELECT id, source_lang, summary,
              (SELECT summary FROM translations
               WHERE item_id = items.id AND lang = 'vi') AS summary_vi
       FROM items WHERE id = ?`
    )
      .bind(id)
      .first<{
        id: string;
        source_lang?: SourceLanguage;
        summary: string | null;
        summary_vi: string | null;
      }>();
    const sourceLang =
      item.source_lang ?? (existing?.source_lang === "vi" ? "vi" : "en");
    if (existing) updated++;
    else inserted++;

    const summary =
      typeof item.summary === "string"
        ? item.summary
        : (existing?.summary ?? null);
    const statements: D1PreparedStatement[] = [
      prepareItemContentChangeLog(env.DB, {
        id,
        field: "title",
        text: item.title,
        reason: "admin",
        lang: sourceLang,
      }),
      prepareItemContentChangeLog(env.DB, {
        id,
        field: "summary",
        text: summary,
        reason: "admin",
        lang: sourceLang,
      }),
      env.DB.prepare(
        `INSERT INTO items (
        id, source_id, external_id, url, title, summary,
        published_at, fetched_at, points, comments,
        llm_relevance, llm_importance, llm_quality, category, tags,
        rank_score, status, source_lang
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        summary = excluded.summary,
        points = excluded.points,
        comments = excluded.comments,
        category = excluded.category,
        tags = excluded.tags,
        status = excluded.status,
        source_lang = excluded.source_lang`
      ).bind(
        id,
        sourceId,
        null,
        item.url,
        item.title,
        summary,
        publishedAt,
        now,
        item.points ?? 0,
        item.comments ?? 0,
        item.relevance ?? null,
        item.importance ?? null,
        item.quality ?? null,
        item.category ?? null,
        JSON.stringify(item.tags ?? []),
        0,
        status,
        sourceLang
      ),
    ];

    if (item.title_vi) {
      const summaryVi =
        typeof item.summary_vi === "string"
          ? item.summary_vi
          : (existing?.summary_vi ?? null);
      statements.push(
        ...prepareLoggedTranslationUpsert(env.DB, {
          id,
          lang: "vi",
          sourceLang,
          targetLang: "vi",
          title: item.title_vi,
          summary: summaryVi,
          reason: "admin",
        })
      );
    } else if (existing) {
      statements.push(prepareTranslationQaInvalidation(env.DB, id));
    }

    await env.DB.batch(statements);
  }

  return { inserted, updated, ids };
}

export async function listSources(env: Env) {
  const { results } = await env.DB.prepare("SELECT * FROM sources").all();
  return results ?? [];
}

export interface UpsertSourceInput {
  name: string;
  type: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

/**
 * `type` must be a key in worker/sources/registry.ts's `adapters` export,
 * or the literal 'push' pseudo-type (items arrive via the push API, no
 * adapter fetch). worker/ingest/fetch.ts's fetch step already no-ops for
 * unknown adapter types (`if (!adapter) return [];`), so a 'push' source
 * is safely skipped by the hourly workflow without further changes there.
 */
export async function upsertSource(
  env: Env,
  id: string,
  input: UpsertSourceInput
): Promise<{ ok: true; id: string } | HandlerError> {
  if (!id) {
    return { error: "id is required", status: 400 };
  }
  if (!input?.name || !input?.type) {
    return { error: "name and type are required", status: 400 };
  }
  const validType = input.type === "push" || input.type in adapters;
  if (!validType) {
    return { error: `unknown source type "${input.type}"`, status: 400 };
  }

  await env.DB.prepare(
    `INSERT INTO sources (id, name, type, config, enabled)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       config = excluded.config,
       enabled = excluded.enabled`
  )
    .bind(
      id,
      input.name,
      input.type,
      JSON.stringify(input.config ?? {}),
      input.enabled === false ? 0 : 1
    )
    .run();

  return { ok: true, id };
}

export async function deleteSource(
  env: Env,
  id: string
): Promise<{ ok: true; id: string } | HandlerError> {
  if (!id) {
    return { error: "id is required", status: 400 };
  }
  const result = await env.DB.prepare("DELETE FROM sources WHERE id = ?")
    .bind(id)
    .run();
  if ((result.meta?.changes ?? 0) === 0) {
    return { error: "source not found", status: 404 };
  }
  return { ok: true, id };
}

export interface TriggerIngestInput {
  force?: unknown;
  dryRun?: unknown;
  steps?: unknown;
}

/** Starts an ingest run. `dryRun` sends no email/Telegram/owner alert and
 * only previews the TL;DR; `steps` runs just those steps (see
 * `worker/ingest/mode.ts`). Bad input is a 400, never a silent full run. */
export async function triggerIngest(
  env: Env,
  input: TriggerIngestInput = {}
): Promise<Awaited<ReturnType<typeof tickIngest>> | HandlerError> {
  if (input.force !== undefined && typeof input.force !== "boolean") {
    return { error: "force must be a boolean", status: 400 };
  }
  const parsed = validateIngestMode(input);
  if (!parsed.ok) return { error: parsed.error, status: 400 };
  const { mode } = parsed;
  const result = await tickIngest(env, { force: input.force === true, mode });
  const tags = [
    mode.dryRun ? "dry-run" : null,
    mode.steps ? `steps=${mode.steps.join(",")}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const outcome = result.skipped
    ? `skipped:${result.reason ?? "ran recently"}`
    : (result.id ?? result.reason ?? "no-id");
  await writeAudit(
    env,
    "ingest.trigger",
    tags ? `${outcome} ${tags}` : outcome
  );
  return {
    ...result,
    ...(mode.dryRun ? { dryRun: true } : {}),
    ...(mode.steps ? { steps: mode.steps } : {}),
  };
}

const DEFAULT_PREVIEW_RANKING_LIMIT = 20;
const MAX_PREVIEW_RANKING_LIMIT = 100;

interface RankingPreviewRow extends RankSignalRow {
  id: string;
  title: string;
  published_at: number;
  llm_relevance: number | null;
  llm_importance: number | null;
  llm_quality: number | null;
  rank_score: number | null;
}

/**
 * Read-only view of the ranking the TL;DR and homepage consume: the same
 * published window `ensureDailyTldr` reads (`buildTopItemsQuery`: the last
 * 24h, capped at the end of today ICT), ordered by stored
 * `rank_score`, with every `rankScore` input and the score it would get if
 * re-ranked now (the hourly write step re-ranks today only). No writes.
 */
export async function previewRanking(env: Env, limitParam?: unknown) {
  const parsed = Number(limitParam);
  const limit =
    Number.isFinite(parsed) && parsed > 0
      ? Math.min(Math.floor(parsed), MAX_PREVIEW_RANKING_LIMIT)
      : DEFAULT_PREVIEW_RANKING_LIMIT;
  const now = Date.now();
  const { since, until } = buildTopItemsQuery(now);
  const { results } = await env.DB.prepare(
    `SELECT id, title, published_at,
            llm_relevance, llm_importance, llm_quality, rank_score,
            ${RANK_SIGNAL_COLUMNS}
     FROM items ${RANK_SIGNAL_JOIN}
     WHERE status = 'published' AND published_at >= ? AND published_at < ?
     ORDER BY rank_score DESC LIMIT ?`
  )
    .bind(since, until, limit)
    .all<RankingPreviewRow>();
  return {
    since,
    limit,
    items: (results ?? []).map((row, index) => {
      // Reader engagement and source families: what the score counts.
      const signals = rowRankSignals(row);
      return {
        rank: index + 1,
        id: row.id,
        title: row.title,
        source_id: row.source_id,
        published_at: row.published_at,
        rank_score: row.rank_score,
        rank_score_now: rankScore({
          importance: row.llm_importance ?? 5,
          quality: row.llm_quality ?? 5,
          publishedAt: row.published_at * 1000,
          now,
          ...signals,
        }),
        inputs: {
          relevance: row.llm_relevance,
          importance: row.llm_importance,
          quality: row.llm_quality,
          points: signals.points,
          comments: signals.comments,
          source_count: signals.sourceCount,
          vote_net: signals.voteNet,
        },
      };
    }),
  };
}

export interface UnmergeResult {
  dryRun: boolean;
  counts: UnmergeCounts;
  applied?: BatchResult;
  plan: UnmergePlan;
}

/**
 * Reverses wrong cluster merges (#733). Body `{ pairs, dryRun? }`, each pair
 * `{ canonicalId, mergedId, group? }`, or `{ dangling: true, decisions?,
 * dryRun? }` to restore every merged row whose canonical id names no item
 * (#791); each decision is `{ mergedId, sameAs | distinctFrom }`. A dry
 * run (the default) returns the plan and writes nothing. Sends nothing
 * either way. See ALGORITHM.md, "Unmerge".
 */
export async function unmergeItems(
  env: Env,
  input: {
    pairs?: unknown;
    dangling?: unknown;
    decisions?: unknown;
    dryRun?: unknown;
  }
): Promise<UnmergeResult | HandlerError> {
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") {
    return { error: "dryRun must be a boolean", status: 400 };
  }
  let plan: UnmergePlan;
  if (input.dangling !== undefined) {
    if (input.dangling !== true || input.pairs !== undefined) {
      return {
        error: "dangling must be true and comes without pairs",
        status: 400,
      };
    }
    const parsed = parseDanglingDecisions(input.decisions);
    if ("error" in parsed) return { error: parsed.error, status: 400 };
    const snapshot = await loadDanglingSnapshot(
      d1Select(env.DB),
      parsed.decisions
    );
    const unknown = unknownDecisionIds(parsed.decisions, snapshot);
    if (unknown.length > 0) {
      return {
        error: `decisions name no item: ${unknown.join(", ")}`,
        status: 400,
      };
    }
    plan = planDanglingUnmerge(snapshot, Date.now(), parsed.decisions);
  } else if (input.decisions !== undefined) {
    return {
      error: "decisions come with dangling; a pair carries its own",
      status: 400,
    };
  } else {
    const parsed = parseUnmergePairs(input.pairs);
    if ("error" in parsed) return { error: parsed.error, status: 400 };
    const snapshot = await loadUnmergeSnapshot(d1Select(env.DB), parsed.pairs);
    plan = planUnmerge(parsed.pairs, snapshot, Date.now());
  }
  const counts = countUnmerge(plan);
  if (input.dryRun !== false) return { dryRun: true, counts, plan };
  return {
    dryRun: false,
    counts,
    applied: await applyUnmerge(env.DB, plan),
    plan,
  };
}

export interface UndoUnmergeResult {
  dryRun: boolean;
  plan: UndoPlan;
  applied?: BatchResult;
}

/**
 * Reverses one unmerge apply from its `admin_audit` rows. Body
 * `{ batchId, dryRun? }`, where `batchId` is the apply's `applied.batchId`.
 * A dry run (the default) returns the plan and writes nothing. A canonical
 * is written back only while every row it touched still holds what the
 * apply wrote. See ALGORITHM.md, "Unmerge".
 */
export async function undoUnmerge(
  env: Env,
  input: { batchId?: unknown; dryRun?: unknown }
): Promise<UndoUnmergeResult | HandlerError> {
  const batchId = parseBatchId(input.batchId);
  if (batchId === null) {
    return { error: "batchId must be a positive integer", status: 400 };
  }
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") {
    return { error: "dryRun must be a boolean", status: 400 };
  }
  const { records, state } = await loadUndo(d1Select(env.DB), batchId);
  if (records.length === 0) {
    return { error: `no unmerge audit rows for batch ${batchId}`, status: 404 };
  }
  const plan = planUndo(batchId, records, state);
  if (input.dryRun !== false) return { dryRun: true, plan };
  return {
    dryRun: false,
    plan,
    applied: await applyUndo(env.DB, plan, Date.now()),
  };
}

export interface BackfillTagsResult {
  dryRun: boolean;
  counts: { tag: number; noMatch: number; recent: number };
  plan: TagBackfillPlan;
  applied?: BatchResult;
}

/**
 * Re-tags published stories stored with no tags (#770) with `fallbackTags`.
 * Body `{ dryRun? }`. A dry run (the default) returns the plan and writes
 * nothing. Neither calls a model. The apply writes only `items.tags`, as one
 * undoable unmerge batch (`undoUnmerge` with `applied.batchId`). See
 * ALGORITHM.md, "Tag backfill (admin)".
 */
export async function backfillTags(
  env: Env,
  input: { dryRun?: unknown }
): Promise<BackfillTagsResult | HandlerError> {
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") {
    return { error: "dryRun must be a boolean", status: 400 };
  }
  const { rows, known } = await loadTagBackfill(d1Select(env.DB));
  const plan = planTagBackfill(rows, known, Date.now());
  const counts = {
    tag: plan.tag.length,
    noMatch: plan.noMatch.length,
    recent: plan.recent.length,
  };
  if (input.dryRun !== false) return { dryRun: true, counts, plan };
  return {
    dryRun: false,
    counts,
    plan,
    applied: await applyTagBackfill(env.DB, plan),
  };
}

/**
 * The TL;DR a run would publish from current data, without writing
 * `tldr_snapshots` and without sending anything. LLM attempts are logged
 * under a `tldr-preview-…` operation id (never an ingest run id).
 */
export async function previewTldr(
  env: Env
): Promise<TldrPreview & { operationId: string }> {
  const operationId = operationRunId("tldr-preview");
  setLlmCallLogger(createD1LlmCallLogger(env));
  try {
    const result = await withLlmCallContext(operationId, () =>
      previewDailyTldr(env)
    );
    return { ...result, operationId };
  } finally {
    await flushLlmCallWrites();
  }
}

function sanitizeAdminRunRow(
  row: Record<string, unknown>
): Record<string, unknown> {
  let stats = row.stats;
  try {
    const parsed = typeof stats === "string" ? JSON.parse(stats) : stats;
    stats =
      typeof parsed === "string"
        ? parsed
        : JSON.stringify(sanitizeRunStats(parsed));
  } catch {
    stats = "{}";
  }
  return {
    ...row,
    error: sanitizeError(row.error)?.message ?? null,
    stats,
  };
}

export async function getStatus(env: Env) {
  const { results: runs } = await env.DB.prepare(
    SELECT_RECENT_WORKFLOW_RUNS_SQL
  ).all();
  const { results: itemsByStatus } = await env.DB.prepare(
    "SELECT status, COUNT(*) as c FROM items GROUP BY status"
  ).all();
  const latestTldr = await env.DB.prepare(
    "SELECT date, created_at FROM tldr_snapshots ORDER BY date DESC LIMIT 1"
  ).first<{ date: string; created_at: number }>();
  let notifications: unknown[] = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT channel, item_id, status, attempts, last_error, posted_at
       FROM notifications ORDER BY posted_at DESC LIMIT 20`
    ).all();
    notifications = (results ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      return {
        ...record,
        last_error: sanitizeError(record.last_error)?.message ?? null,
      };
    });
  } catch {
    notifications = [];
  }
  return {
    runs: (runs ?? []).map((row) =>
      sanitizeAdminRunRow(row as Record<string, unknown>)
    ),
    itemsByStatus: itemsByStatus ?? [],
    telegram: {
      configured: Boolean(
        env.TELEGRAM_BOT_TOKEN &&
          (env.TELEGRAM_VI_CHAT_ID || env.TELEGRAM_CHAT_ID)
      ),
      englishConfigured: Boolean(
        env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_EN_CHAT_ID
      ),
    },
    latestTldr: latestTldr ?? null,
    notifications,
  };
}

export async function listNotifications(env: Env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT channel, item_id, target, status, attempts, message_id, last_error, posted_at
       FROM notifications ORDER BY posted_at DESC LIMIT 50`
    ).all();
    return {
      notifications: (results ?? []).map((row) => {
        const record = row as Record<string, unknown>;
        return {
          ...record,
          last_error: sanitizeError(record.last_error)?.message ?? null,
        };
      }),
    };
  } catch {
    return { notifications: [] };
  }
}

export async function listAudit(env: Env) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT ts, action, detail FROM admin_audit ORDER BY ts DESC LIMIT 50"
    ).all();
    return { audit: results ?? [] };
  } catch {
    return { audit: [] };
  }
}

export async function retryTelegramDigest(env: Env) {
  const result = await forceSendDigest(env);
  await writeAudit(env, "notify.digest", result.reason);
  return result;
}

const DEFAULT_LLM_CALLS_LIMIT = 100;
const MAX_LLM_CALLS_LIMIT = 500;

/**
 * Newest-first rows from `llm_calls` (see migrations/0013_llm_calls.sql),
 * one row per anyrouter model attempt. `limitParam` comes straight from a
 * query string, so it's parsed defensively: anything non-numeric or <= 0
 * falls back to the default, and the result is always capped.
 */
function sanitizeAdminLlmCall(
  row: Record<string, unknown>
): Record<string, unknown> {
  const safe = sanitizeError(row.error);
  const { response_snippet: _responseSnippet, ...rest } = row;
  const sanitized: Record<string, unknown> = {
    ...rest,
    error: safe?.message ?? null,
    error_code:
      row.error_code != null || safe
        ? safeErrorCode(row.error_code, safe?.code ?? "unknown_error")
        : null,
    error_status: safeErrorStatus(row.error_status ?? safe?.status),
  };
  if ("id" in row && "response_snippet" in row) {
    sanitized.response_snippet = null;
  }
  return sanitized;
}

export async function getLlmCalls(env: Env, limitParam?: string | null) {
  const parsed = limitParam ? Number(limitParam) : Number.NaN;
  const limit =
    Number.isFinite(parsed) && parsed > 0
      ? Math.min(Math.floor(parsed), MAX_LLM_CALLS_LIMIT)
      : DEFAULT_LLM_CALLS_LIMIT;
  let results: Record<string, unknown>[];
  try {
    const response = await env.DB.prepare(
      `SELECT ts, run_id, task, model, ok, tokens, duration_ms, prompt_chars,
              error, error_code, error_status, prompt_tokens,
              completion_tokens, cached_tokens
       FROM llm_calls ORDER BY ts DESC LIMIT ?`
    )
      .bind(limit)
      .all<Record<string, unknown>>();
    results = response.results ?? [];
  } catch {
    const response = await env.DB.prepare(
      `SELECT ts, task, model, ok, tokens, duration_ms, prompt_chars, error
       FROM llm_calls ORDER BY ts DESC LIMIT ?`
    )
      .bind(limit)
      .all<Record<string, unknown>>();
    results = response.results ?? [];
  }
  return { calls: results.map(sanitizeAdminLlmCall) };
}

export interface ReprocessInput {
  steps?: ("score" | "translate")[];
  scope?: "today";
}

export interface ReprocessResult {
  processed: number;
  scored: number;
  translated: number;
  tokens: number;
}

interface ReprocessItemRow extends RankSignalRow {
  id: string;
  title: string;
  summary: string | null;
  published_at: number;
  source_lang: "en" | "vi";
}

/** Epoch seconds for the start of the current UTC day — matches
 * `items.published_at`'s stored unit (see worker/time.ts / workflow.ts). */
function startOfTodayUtcSec(): number {
  return Math.floor(Date.UTC(...splitUtcDate(new Date())) / 1000);
}

/** Admin operations get an explicit telemetry id but never masquerade as an
 * ingest `workflow_runs.id`; run-history queries therefore cannot mix them in. */
function operationRunId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function splitUtcDate(d: Date): [number, number, number] {
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
}

// Workers isolate-scope guard: fine for this single-instance admin action,
// not a distributed lock. See task doc for rationale.
let reprocessInFlight = false;

/**
 * Re-runs scoring and/or translation over today's already-published items,
 * writing results back with UPDATE (score) / upsert-by-id (translate) —
 * never INSERT of a new items row, so this cannot create duplicates.
 */
export async function reprocessToday(
  env: Env,
  input: ReprocessInput
): Promise<ReprocessResult | HandlerError> {
  if (reprocessInFlight) {
    return { error: "reprocess already running", status: 409 };
  }
  reprocessInFlight = true;
  try {
    const steps = input.steps ?? ["score", "translate"];
    const doScore = steps.includes("score");
    const doTranslate = steps.includes("translate");
    const operationId = operationRunId("reprocess");

    // The operation id is supplied by the explicit async context below, not
    // as a global fallback that could tag an unrelated concurrent call.
    setLlmCallLogger(createD1LlmCallLogger(env));

    const since = startOfTodayUtcSec();
    const { results } = await env.DB.prepare(
      `SELECT id, title, summary, published_at, source_lang,
              ${RANK_SIGNAL_COLUMNS}
       FROM items ${RANK_SIGNAL_JOIN}
       WHERE status = 'published' AND published_at >= ?`
    )
      .bind(since)
      .all<ReprocessItemRow>();
    const items = results ?? [];

    let scoredCount = 0;
    let translatedCount = 0;
    let tokens = 0;

    if (doScore && items.length > 0) {
      const scoreResults = await withLlmCallContext(operationId, () =>
        scoreItems(
          env,
          items.map((row, i) => ({
            i,
            title: row.title,
            summary: row.summary ?? undefined,
            source: row.source_id,
          }))
        )
      );

      const storiesById = new Map<string, ScoredStoryTags>();
      const scoreByItemId = new Map<string, (typeof scoreResults)[number]>();
      for (const result of scoreResults) {
        const row = items[result.i];
        if (!row) continue;
        storiesById.set(row.id, {
          tags: result.tags,
          title: row.title,
          sourceId: row.source_id,
        });
        scoreByItemId.set(row.id, result);
      }
      const nowMs = Date.now();
      const canonicalTagsByItem = await withLlmCallContext(operationId, () =>
        normalizeTopics(env, storiesById, nowMs)
      );
      await captureAndLearnTopics(env.DB, canonicalTagsByItem, nowMs);

      const statements: D1PreparedStatement[] = [];
      for (const row of items) {
        const score = scoreByItemId.get(row.id);
        if (!score) continue;
        tokens += score.tokens;
        scoredCount++;
        const tags = canonicalTagsByItem.get(row.id) ?? score.tags;
        const rank = rankScore({
          importance: score.importance,
          quality: score.quality,
          publishedAt: row.published_at * 1000,
          now: Date.now(),
          ...rowRankSignals(row),
        });
        statements.push(
          env.DB.prepare(
            `UPDATE items SET
               llm_relevance = ?, llm_importance = ?, llm_quality = ?,
               category = ?, tags = ?, rank_score = ?
             WHERE id = ?`
          ).bind(
            score.relevance,
            score.importance,
            score.quality,
            score.category || null,
            JSON.stringify(tags),
            rank,
            row.id
          )
        );
      }
      if (statements.length > 0) await env.DB.batch(statements);
    }

    if (doTranslate && items.length > 0) {
      const translateResults = await withLlmCallContext(operationId, () =>
        translateItems(
          env,
          items.map((row, i) => ({
            i,
            title: row.title,
            summary: row.summary ?? undefined,
            sourceLang: row.source_lang === "vi" ? "vi" : "en",
          }))
        )
      );

      const statements: D1PreparedStatement[] = [];
      for (const result of translateResults) {
        const row = items[result.i];
        if (!row || !result.title) continue;
        tokens += result.tokens;
        translatedCount++;
        statements.push(
          ...prepareLoggedTranslationUpsert(env.DB, {
            id: row.id,
            lang: "vi",
            sourceLang: row.source_lang === "vi" ? "vi" : "en",
            targetLang: "vi",
            title: result.title,
            summary: result.summary,
            reason: "admin",
          })
        );
      }
      if (statements.length > 0) await env.DB.batch(statements);
    }

    return {
      processed: items.length,
      scored: scoredCount,
      translated: translatedCount,
      tokens,
    };
  } finally {
    // Fire-and-forget `llm_calls` inserts must land before the request
    // context ends, otherwise the reprocess telemetry is lost.
    await flushLlmCallWrites();
    reprocessInFlight = false;
  }
}

const DEFAULT_ITEMS_LIMIT = 50;
const MAX_ITEMS_LIMIT = 200;

/**
 * Newest-first rows from `items` across all statuses (published / rejected /
 * merged / new), for the moderation surface. `limitParam` parsed the same
 * defensive way as getLlmCalls.
 */
export async function listItems(env: Env, limitParam?: string | null) {
  const parsed = limitParam ? Number(limitParam) : Number.NaN;
  const limit =
    Number.isFinite(parsed) && parsed > 0
      ? Math.min(Math.floor(parsed), MAX_ITEMS_LIMIT)
      : DEFAULT_ITEMS_LIMIT;
  const { results } = await env.DB.prepare(
    `SELECT id, source_id, title, url, status, published_at,
            llm_relevance, llm_importance, llm_quality, category, tags,
            rank_score, points, comments
     FROM items ORDER BY published_at DESC LIMIT ?`
  )
    .bind(limit)
    .all();
  return { items: results ?? [] };
}

export interface UpdateItemInput {
  id: string;
  action: "reject" | "restore" | "rate";
  importance?: number;
  quality?: number;
  relevance?: number;
}

interface ItemRow extends RankSignalRow {
  id: string;
  published_at: number;
  llm_relevance: number | null;
  llm_importance: number | null;
  llm_quality: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Moderation mutation for a single item, by id: reject/restore flip
 * `status`; rate updates the given llm_* fields (clamped to their valid
 * ranges) and recomputes rank_score from its cluster's rank signals and
 * published_at (seconds, matches items.published_at's unit — see
 * reprocessToday above) and the current time. Always UPDATE-by-id, never
 * INSERT; 404s when the id doesn't exist.
 */
export async function updateItem(
  env: Env,
  input: UpdateItemInput
): Promise<Record<string, unknown> | HandlerError> {
  if (!input?.id) {
    return { error: "id is required", status: 400 };
  }
  const row = await env.DB.prepare(
    `SELECT id, published_at,
            llm_relevance, llm_importance, llm_quality,
            ${RANK_SIGNAL_COLUMNS}
     FROM items ${RANK_SIGNAL_JOIN}
     WHERE id = ?`
  )
    .bind(input.id)
    .first<ItemRow>();
  if (!row) {
    return { error: "item not found", status: 404 };
  }

  if (input.action === "reject" || input.action === "restore") {
    const status = input.action === "reject" ? "rejected" : "published";
    await env.DB.prepare("UPDATE items SET status = ? WHERE id = ?")
      .bind(status, input.id)
      .run();
  } else if (input.action === "rate") {
    const importance =
      input.importance !== undefined
        ? clamp(input.importance, 0, 10)
        : (row.llm_importance ?? 0);
    const quality =
      input.quality !== undefined
        ? clamp(input.quality, 0, 10)
        : (row.llm_quality ?? 0);
    const relevance =
      input.relevance !== undefined
        ? clamp(input.relevance, 0, 1)
        : row.llm_relevance;

    const rank = rankScore({
      importance,
      quality,
      publishedAt: row.published_at * 1000,
      now: Date.now(),
      ...rowRankSignals(row),
    });

    await env.DB.prepare(
      `UPDATE items SET
         llm_relevance = ?, llm_importance = ?, llm_quality = ?, rank_score = ?
       WHERE id = ?`
    )
      .bind(relevance, importance, quality, rank, input.id)
      .run();
  } else {
    return { error: `unknown action "${input.action}"`, status: 400 };
  }

  const updated = await env.DB.prepare("SELECT * FROM items WHERE id = ?")
    .bind(input.id)
    .first();
  return (updated ?? {}) as Record<string, unknown>;
}

/** How far back an admin regenerate may rewrite a closed date. */
export const TLDR_REGENERATE_MAX_DAYS = 14;

/**
 * Rebuilds the TL;DR row for `date` (default today, ICT) through
 * `regenerateDailyTldr`: written only when it is a model digest, otherwise
 * the stored row is left as it was. `dryRun` writes nothing. Never sends
 * email, Telegram or Facebook; those read the current local day's row on
 * their own schedule. LLM attempts are logged under a `tldr-…` operation id.
 */
export async function regenerateTldr(
  env: Env,
  input: { date?: unknown; dryRun?: unknown } = {}
): Promise<(TldrRegenerateResult & { operationId: string }) | HandlerError> {
  const nowMs = Date.now();
  const today = tldrSnapshotDate(nowMs);
  const oldest = tldrSnapshotDate(
    nowMs - TLDR_REGENERATE_MAX_DAYS * 86_400_000
  );
  const date =
    input.date === undefined ? today : parseArchiveDate(input.date, nowMs);
  if (!date) {
    return {
      error: `date must be a YYYY-MM-DD day no later than today (${today})`,
      status: 400,
    };
  }
  if (date < oldest) {
    return {
      error: `date must be within the last ${TLDR_REGENERATE_MAX_DAYS} days (${oldest} or later)`,
      status: 400,
    };
  }
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") {
    return { error: "dryRun must be a boolean", status: 400 };
  }
  const dryRun = input.dryRun === true;

  const operationId = operationRunId("tldr");
  // Keep the sink unscoped; the explicit context below carries this id.
  setLlmCallLogger(createD1LlmCallLogger(env));
  try {
    const result = await withLlmCallContext(operationId, () =>
      regenerateDailyTldr(env, date, { dryRun })
    );
    if (!dryRun) {
      await writeAudit(env, "tldr.regenerate", `${date}: ${result.reason}`);
    }
    return { ...result, operationId };
  } finally {
    await flushLlmCallWrites();
  }
}

export async function listPendingSuggestions(
  env: Env,
  limitParam?: string | null
) {
  const limit = Math.min(
    Math.max(Number.parseInt(limitParam ?? "50", 10) || 50, 1),
    100
  );
  const { results } = await env.DB.prepare(
    `SELECT id, item_id, lang, field, suggestion, user_name, rating, review_note, created_at, status
     FROM translation_suggestions
     WHERE status IN ('pending', 'needs_review')
     ORDER BY created_at ASC
     LIMIT ${limit}`
  ).all();
  return { suggestions: results ?? [] };
}

export async function listPendingSubmissions(
  env: Env,
  limitParam?: string | null
) {
  const limit = Math.min(
    Math.max(Number.parseInt(limitParam ?? "50", 10) || 50, 1),
    100
  );
  const { results } = await env.DB.prepare(
    `SELECT id, url, title, note, user_name, rating, created_at, status
     FROM submissions
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT ${limit}`
  ).all();
  return { submissions: results ?? [] };
}

export async function decideSuggestion(
  env: Env,
  body: { id?: string; action?: string }
): Promise<{ ok: true } | HandlerError> {
  const id = body.id;
  const action = body.action;
  if (!id || (action !== "approve" && action !== "reject")) {
    return { error: "id and action (approve|reject) required", status: 400 };
  }
  const { approveSuggestionById, rejectSuggestionById } = await import(
    "../suggestions.js"
  );
  const result =
    action === "approve"
      ? await approveSuggestionById(env, id)
      : await rejectSuggestionById(env, id);
  if (!result.ok) return { error: result.error, status: 404 };
  await writeAudit(env, `suggestions.${action}`, id);
  return { ok: true };
}

export async function listTranslationKnowledge(
  env: Env,
  status?: string | null
) {
  const { listKnowledge } = await import("../translation-knowledge.js");
  return listKnowledge(env, status);
}

/** Activate, park or disable one translation-knowledge rule. */
export async function decideTranslationKnowledge(
  env: Env,
  body: { id?: string; status?: string }
): Promise<{ ok: true } | HandlerError> {
  const { id, status } = body;
  if (
    !id ||
    (status !== "active" && status !== "pending" && status !== "disabled")
  ) {
    return {
      error: "id and status (active|pending|disabled) required",
      status: 400,
    };
  }
  const { setKnowledgeStatus } = await import("../translation-knowledge.js");
  if (!(await setKnowledgeStatus(env, id, status))) {
    return { error: "not found", status: 404 };
  }
  await writeAudit(env, `knowledge.${status}`, id);
  return { ok: true };
}

export async function decideSubmission(
  env: Env,
  body: { id?: string; action?: string }
): Promise<{ ok: true } | HandlerError> {
  const id = body.id;
  const action = body.action;
  if (!id || (action !== "approve" && action !== "reject")) {
    return { error: "id and action (approve|reject) required", status: 400 };
  }
  const { acceptSubmissionById, rejectSubmissionById } = await import(
    "../submissions.js"
  );
  const result =
    action === "approve"
      ? await acceptSubmissionById(env, id)
      : await rejectSubmissionById(env, id);
  if (!result.ok) return { error: result.error, status: 404 };
  await writeAudit(env, `submissions.${action}`, id);
  return { ok: true };
}

export interface SetDayVideoInput {
  /** Language of the video: "en" (default) or "vi". Never falls back. */
  lang?: unknown;
  /** 16:9 video for desktop: URL or 11-char id; null/"" clears it. */
  video?: unknown;
  /** 9:16 Short for mobile: URL or 11-char id; null/"" clears it. */
  short?: unknown;
  /** Display title; null/"" clears it. */
  title?: unknown;
}

/** The record returned for the language that was written. */
export interface DayVideoRecord {
  date: string;
  lang: Lang;
  youtube_id: string | null;
  short_id: string | null;
  title: string | null;
}

interface DayVideoRow {
  youtube_id: string | null;
  short_id: string | null;
  title: string | null;
  youtube_id_vi: string | null;
  short_id_vi: string | null;
  title_vi: string | null;
}

const DAY_VIDEO_COLUMNS =
  "youtube_id, short_id, title, youtube_id_vi, short_id_vi, title_vi";

const DAY_VIDEO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDayVideoDate(date: unknown): date is string {
  if (typeof date !== "string" || !DAY_VIDEO_DATE_RE.test(date)) return false;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return (
    Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date
  );
}

/** undefined = English (the default); anything but "en"/"vi" is rejected. */
function dayVideoLang(value: unknown): { lang: Lang } | HandlerError {
  if (value === undefined) return { lang: "en" };
  if (value === "en" || value === "vi") return { lang: value };
  return { error: 'lang must be "en" or "vi"', status: 400 };
}

/** The language's own columns of a row; the other language is never read. */
function dayVideoForLang(row: DayVideoRow | null, lang: Lang) {
  return lang === "vi"
    ? {
        youtube_id: row?.youtube_id_vi ?? null,
        short_id: row?.short_id_vi ?? null,
        title: row?.title_vi ?? null,
      }
    : {
        youtube_id: row?.youtube_id ?? null,
        short_id: row?.short_id ?? null,
        title: row?.title ?? null,
      };
}

/** undefined = keep the stored value, null = clear, string = new id. */
function dayVideoIdField(
  value: unknown,
  label: string
): { id: string | null | undefined } | HandlerError {
  if (value === undefined) return { id: undefined };
  if (value === null || value === "") return { id: null };
  const id = parseYoutubeId(value);
  if (!id) {
    return {
      error: `${label} must be a YouTube URL or an 11-character video id`,
      status: 400,
    };
  }
  return { id };
}

function hasAnyDayVideoId(row: DayVideoRow): boolean {
  return Boolean(
    row.youtube_id || row.short_id || row.youtube_id_vi || row.short_id_vi
  );
}

/**
 * Upsert the video and/or Short shown on `/date/:date` for one language
 * (`lang`, default "en"). Each field is set or cleared independently;
 * omitted fields keep their stored value. The row must keep at least one id
 * across both languages — use `deleteDayVideo` to remove it.
 */
export async function setDayVideo(
  env: Env,
  date: unknown,
  input: SetDayVideoInput,
  actor: string | null
): Promise<
  { ok: true; video: DayVideoRecord; digest_button: string } | HandlerError
> {
  if (!validDayVideoDate(date)) {
    return { error: "date must be a real YYYY-MM-DD day", status: 400 };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "body must be an object", status: 400 };
  }
  const langField = dayVideoLang(input.lang);
  if (isHandlerError(langField)) return langField;
  const { lang } = langField;
  const video = dayVideoIdField(input.video, "video");
  if (isHandlerError(video)) return video;
  const short = dayVideoIdField(input.short, "short");
  if (isHandlerError(short)) return short;
  if (
    input.title !== undefined &&
    input.title !== null &&
    typeof input.title !== "string"
  ) {
    return { error: "title must be a string", status: 400 };
  }
  if (
    video.id === undefined &&
    short.id === undefined &&
    input.title === undefined
  ) {
    return { error: "set at least one of video, short, title", status: 400 };
  }

  const existing = await env.DB.prepare(
    `SELECT ${DAY_VIDEO_COLUMNS} FROM day_videos WHERE date = ?`
  )
    .bind(date)
    .first<DayVideoRow>();
  const current = dayVideoForLang(existing, lang);
  const title =
    input.title === undefined
      ? current.title
      : typeof input.title === "string" && input.title.trim()
        ? input.title.trim().slice(0, DAY_VIDEO_TITLE_MAX)
        : null;
  const next: DayVideoRecord = {
    date,
    lang,
    youtube_id: video.id === undefined ? current.youtube_id : video.id,
    short_id: short.id === undefined ? current.short_id : short.id,
    title,
  };
  const row: DayVideoRow = {
    youtube_id: existing?.youtube_id ?? null,
    short_id: existing?.short_id ?? null,
    title: existing?.title ?? null,
    youtube_id_vi: existing?.youtube_id_vi ?? null,
    short_id_vi: existing?.short_id_vi ?? null,
    title_vi: existing?.title_vi ?? null,
  };
  if (lang === "vi") {
    row.youtube_id_vi = next.youtube_id;
    row.short_id_vi = next.short_id;
    row.title_vi = next.title;
  } else {
    row.youtube_id = next.youtube_id;
    row.short_id = next.short_id;
    row.title = next.title;
  }
  if (!hasAnyDayVideoId(row)) {
    return {
      error:
        "a day video needs a video or a short; delete the row to remove everything",
      status: 400,
    };
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO day_videos
       (date, youtube_id, short_id, title, youtube_id_vi, short_id_vi, title_vi,
        added_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       youtube_id = excluded.youtube_id,
       short_id = excluded.short_id,
       title = excluded.title,
       youtube_id_vi = excluded.youtube_id_vi,
       short_id_vi = excluded.short_id_vi,
       title_vi = excluded.title_vi,
       added_by = excluded.added_by,
       updated_at = excluded.updated_at`
  )
    .bind(
      date,
      row.youtube_id,
      row.short_id,
      row.title,
      row.youtube_id_vi,
      row.short_id_vi,
      row.title_vi,
      actor,
      now,
      now
    )
    .run();
  await writeAudit(
    env,
    "day_video_set",
    JSON.stringify({
      date,
      lang,
      youtube_id: next.youtube_id,
      short_id: next.short_id,
    })
  );
  // The digest usually went out before the video was uploaded.
  const digest_button = await syncDigestVideoButton(
    env,
    date,
    lang,
    next.youtube_id ?? next.short_id
  );
  return { ok: true, video: next, digest_button };
}

/**
 * Remove a day's video. Without `lang` the whole row goes (both languages);
 * with `lang` only that language's fields are cleared, and the row goes when
 * no id remains in either language.
 */
export async function deleteDayVideo(
  env: Env,
  date: unknown,
  lang?: unknown
): Promise<
  { ok: true; date: string; lang?: Lang; deleted: boolean } | HandlerError
> {
  if (!validDayVideoDate(date)) {
    return { error: "date must be a real YYYY-MM-DD day", status: 400 };
  }
  if (lang === undefined || lang === null) {
    const result = await env.DB.prepare("DELETE FROM day_videos WHERE date = ?")
      .bind(date)
      .run();
    const deleted = (result.meta?.changes ?? 0) > 0;
    if (deleted) await writeAudit(env, "day_video_delete", date);
    return { ok: true, date, deleted };
  }
  const langField = dayVideoLang(lang);
  if (isHandlerError(langField)) return langField;
  const scope = langField.lang;
  const existing = await env.DB.prepare(
    `SELECT ${DAY_VIDEO_COLUMNS} FROM day_videos WHERE date = ?`
  )
    .bind(date)
    .first<DayVideoRow>();
  const stored = dayVideoForLang(existing, scope);
  if (!existing || (!stored.youtube_id && !stored.short_id && !stored.title)) {
    return { ok: true, date, lang: scope, deleted: false };
  }
  const remaining: DayVideoRow = {
    ...existing,
    ...(scope === "vi"
      ? { youtube_id_vi: null, short_id_vi: null, title_vi: null }
      : { youtube_id: null, short_id: null, title: null }),
  };
  if (hasAnyDayVideoId(remaining)) {
    const columns =
      scope === "vi"
        ? "youtube_id_vi = NULL, short_id_vi = NULL, title_vi = NULL"
        : "youtube_id = NULL, short_id = NULL, title = NULL";
    await env.DB.prepare(
      `UPDATE day_videos SET ${columns}, updated_at = ? WHERE date = ?`
    )
      .bind(Date.now(), date)
      .run();
  } else {
    await env.DB.prepare("DELETE FROM day_videos WHERE date = ?")
      .bind(date)
      .run();
  }
  await writeAudit(
    env,
    "day_video_delete",
    JSON.stringify({ date, lang: scope })
  );
  return { ok: true, date, lang: scope, deleted: true };
}

export interface RecordDayVideoPostInput {
  channel?: unknown;
  /** `<chat_id>/<message_id>` of the post. */
  ref?: unknown;
}

const DAY_VIDEO_POST_REF_MAX = 100;

/**
 * Record that the day's video reached a channel the Worker cannot read back
 * (Telegram), for the day video watchdog. Idempotent: a repeat keeps the
 * first `recorded_at` and stores the latest ref.
 */
export async function recordDayVideoPost(
  env: Env,
  date: unknown,
  input: RecordDayVideoPostInput
): Promise<
  | { ok: true; date: string; channel: DayVideoPostChannel; ref: string }
  | HandlerError
> {
  if (!validDayVideoDate(date)) {
    return { error: "date must be a real YYYY-MM-DD day", status: 400 };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "body must be an object", status: 400 };
  }
  if (!isDayVideoPostChannel(input.channel)) {
    return {
      error: `channel must be one of ${DAY_VIDEO_POST_CHANNELS.join(", ")}`,
      status: 400,
    };
  }
  const ref = typeof input.ref === "string" ? input.ref.trim() : "";
  if (!ref || ref.length > DAY_VIDEO_POST_REF_MAX) {
    return {
      error: `ref must be a non-empty string of at most ${DAY_VIDEO_POST_REF_MAX} characters`,
      status: 400,
    };
  }
  await env.DB.prepare(
    `INSERT INTO day_video_posts (date, channel, ref, recorded_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(date, channel) DO UPDATE SET ref = excluded.ref`
  )
    .bind(date, input.channel, ref, Date.now())
    .run();
  return { ok: true, date, channel: input.channel, ref };
}

export interface SendDayVideoTelegramInput {
  lang?: unknown;
  /** Override target chat (e.g. the staging channel); default is the
   *  language's configured channel. */
  chat_id?: unknown;
}

/**
 * Post a day's video (the given language's `youtube_id`) to Telegram. 404 when
 * that language has no 16:9 video — the other language's is never used.
 */
export async function sendDayVideoTelegram(
  env: Env,
  date: unknown,
  input: SendDayVideoTelegramInput
): Promise<
  | {
      ok: true;
      chat_id: string;
      message_id: string;
      digest_button?: string;
      /** Whether the channel post was recorded in `day_video_posts`. */
      recorded?: boolean;
    }
  | HandlerError
> {
  if (!validDayVideoDate(date)) {
    return { error: "date must be a real YYYY-MM-DD day", status: 400 };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "body must be an object", status: 400 };
  }
  if (input.lang !== "en" && input.lang !== "vi") {
    return { error: 'lang must be "en" or "vi"', status: 400 };
  }
  const lang: Lang = input.lang;
  if (
    input.chat_id !== undefined &&
    (typeof input.chat_id !== "string" || !input.chat_id.trim())
  ) {
    return { error: "chat_id must be a non-empty string", status: 400 };
  }
  const row = await env.DB.prepare(
    `SELECT ${DAY_VIDEO_COLUMNS} FROM day_videos WHERE date = ?`
  )
    .bind(date)
    .first<DayVideoRow>();
  const stored = dayVideoForLang(row, lang);
  if (!stored.youtube_id) {
    return {
      error: `no ${lang} youtube_id stored for ${date}; set it first`,
      status: 404,
    };
  }
  const chat = (input.chat_id as string | undefined)?.trim();
  const chatId = chat ?? telegramChatId(env, lang).id;
  if (!chatId) {
    return {
      error: `no Telegram chat for ${lang}: pass chat_id or set ${telegramChatId(env, lang).source}`,
      status: 409,
    };
  }
  if (!env.TELEGRAM_BOT_TOKEN?.trim()) {
    return { error: "TELEGRAM_BOT_TOKEN is not set", status: 409 };
  }
  const sent = await sendDayVideoToTelegram(env, chatId, {
    date,
    lang,
    youtubeId: stored.youtube_id,
    title: stored.title,
  });
  if (!sent.ok) {
    return {
      error: `telegram send failed: ${sent.error ?? "unknown"}${sent.ambiguous ? " (outcome unknown; check the chat before retrying)" : ""}`,
      status: 502,
    };
  }
  await writeAudit(
    env,
    "day_video_telegram",
    JSON.stringify({
      date,
      lang,
      chat_id: chatId,
      message_id: sent.messageId ?? null,
    })
  );
  // Posting to the language's own channel also records the post for the
  // watchdog and brings that channel's digest up to date (its "▶ YouTube"
  // button); a staging chat leaves both alone. The post is out, so a failed
  // record is reported in the result, never as an error a caller retries.
  let recorded: boolean | undefined;
  if (!chat && sent.messageId) {
    try {
      await recordDayVideoPost(env, date, {
        channel: `telegram-${lang}`,
        ref: `${chatId}/${sent.messageId}`,
      });
      recorded = true;
    } catch (error) {
      console.error("day video post record failed:", error);
      recorded = false;
    }
  }
  const digest_button = chat
    ? undefined
    : await syncDigestVideoButton(env, date, lang, stored.youtube_id);
  return {
    ok: true,
    chat_id: chatId,
    message_id: sent.messageId ?? "",
    ...(digest_button ? { digest_button } : {}),
    ...(recorded === undefined ? {} : { recorded }),
  };
}
