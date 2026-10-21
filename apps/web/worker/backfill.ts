import { preferCompleteSummary } from "./enrich.js";
import {
  buildMediaManifest,
  type MediaManifest,
  parseMediaManifest,
  primaryThumbnailUrl,
  serializeMediaManifest,
} from "./media.js";
import { RANK_SIGNAL_COLUMNS, RANK_SIGNAL_JOIN } from "./ranking.js";

/**
 * Pure helpers for the "backfill" workflow steps that fill in
 * summary/media for items that predate the enrichment pipeline (or
 * were enriched from a source that had nothing usable at the time), and
 * then translate whatever summaries exist but lack a Vietnamese one.
 */

export const BACKFILL_CONTENT_CAP = 15;
/** Hourly drain for missing title_vi. 15 left today's EN badges up for
 * many hours after a failed ingest translate; 45 is 15 workflow slices
 * of TRANSLATE_BATCH_SIZE and still well under the step budget. */
export const BACKFILL_TRANSLATE_CAP = 45;
export const BACKFILL_SCORE_CAP = 15;
export const BACKFILL_BATCH_SIZE = 4;

/** Published items still missing a summary, oldest-content-first isn't the
 * point — most-recently-published first, so the backlog drains starting
 * from what readers are most likely to open. A row the leg already
 * fetched (`summary_checked_at`, migration 0066) is not selected again. */
export function buildMissingSummaryQuery(limit = BACKFILL_CONTENT_CAP): string {
  return `SELECT id, url, source_id, summary, image_url, media_manifest FROM items
          WHERE status = 'published' AND (
            summary IS NULL OR summary = ''
            OR rtrim(summary) LIKE '%…' OR rtrim(summary) LIKE '%...'
            OR rtrim(summary) LIKE '%[…]' OR rtrim(summary) LIKE '%[...]'
            OR summary LIKE '%Read more%' OR summary LIKE '%Continue reading%'
          ) AND summary_checked_at IS NULL
          ORDER BY published_at DESC
          LIMIT ${limit}`;
}

/** The 0024 column default: no enrich or backfill has stored this row's
 * media yet. Any written manifest, even an empty one, ends the state. */
export const UNCHECKED_MEDIA_SQL =
  "(media_manifest IS NULL OR media_manifest = '' OR media_manifest = '[]')";

export function buildMissingMediaQuery(limit = BACKFILL_CONTENT_CAP): string {
  // A row is a candidate when it has no media_manifest yet. The legacy
  // `image_url` column must NOT gate this query: requiring it to be empty
  // excluded every row that already carried a legacy og:image, so exactly the
  // rows that most need a manifest (existing image, no manifest) could never be
  // enriched. `image_url` is still selected so the manifest can be built from
  // it. See issue #207.
  return `SELECT id, url, source_id, summary, image_url, media_manifest FROM items
          WHERE status = 'published' AND summary IS NOT NULL AND summary != ''
            AND ${UNCHECKED_MEDIA_SQL}
          ORDER BY published_at DESC
          LIMIT ${limit}`;
}

/**
 * Published English-source items with no usable Vietnamese title yet. Title-only
 * rows (no English summary) still get a title translation — the UI must not
 * invent one. A non-empty VI summary is still missing when it is a length-cut
 * of a long English source: at least 200 characters and under 60% of that
 * length, the same bar as translationDraftIssues. That is how a same-run
 * replacement of a short blurb is translated again. This query does not write
 * a translation. Evaluated fresh each run so the same-run content-backfill
 * is picked up without unioning result sets in application code.
 */
export function buildMissingTranslationQuery(
  limit = BACKFILL_TRANSLATE_CAP
): string {
  return `SELECT i.id, i.title, i.summary, i.source_lang FROM items i
          WHERE i.status = 'published'
            AND i.source_lang = 'en'
            AND NOT EXISTS (
            SELECT 1 FROM translations t
            WHERE t.item_id = i.id AND t.lang = 'vi'
              AND t.title IS NOT NULL AND t.title != ''
              -- A summary the source has but the VI row lacks (a batch
              -- that kept the title and dropped the summary) also counts.
              -- length(vi) * 5 < length(en) * 3 is vi/en < 0.6 without
              -- SQLite integer division. Source under 200 characters stays
              -- done: the ratio is not meaningful there.
              AND (i.summary IS NULL OR i.summary = ''
                   OR (t.summary IS NOT NULL AND t.summary != ''
                       AND NOT (length(i.summary) >= 200
                                AND length(t.summary) * 5 < length(i.summary) * 3)))
          )
          ORDER BY i.published_at DESC
          LIMIT ${limit}`;
}

/** How far back backfill re-checks stored VI rows, and how many flagged
 * rows it re-translates per run: one batch. Each item is re-translated at
 * most once (`translation_rechecks`), so a row the model cannot fix gives
 * its slot to the next flagged row. */
export const RECHECK_TRANSLATE_WINDOW_SEC = 2 * 86_400;
export const RECHECK_TRANSLATE_CAP = 3;

/** Stored EN→VI rows of recent published items not re-checked before, to
 * run the draft check again: a skipped repair or a newer rule leaves a
 * stored row unchecked. */
export function buildStoredTranslationQuery(): string {
  return `SELECT i.id, i.title, i.summary, i.source_lang,
                 t.title AS vi_title, t.summary AS vi_summary
          FROM items i JOIN translations t
            ON t.item_id = i.id AND t.lang = 'vi'
          LEFT JOIN translation_rechecks r ON r.item_id = i.id
          WHERE i.status = 'published'
            AND i.source_lang = 'en'
            AND t.title IS NOT NULL AND t.title != ''
            AND r.item_id IS NULL
            AND i.published_at >= ?
          ORDER BY i.published_at DESC`;
}

/** Marks an item re-checked before its retry is sent, so a retry that times
 * out still counts as its one attempt. */
export const MARK_TRANSLATION_RECHECKED_SQL = `INSERT INTO translation_rechecks (item_id, attempted_at)
VALUES (?, ?)
ON CONFLICT(item_id) DO UPDATE SET attempted_at = excluded.attempted_at`;

/** Published items that never got an LLM score (`llm_relevance` still null).
 * Merge writes tags onto a canonical and does not set the score columns, so
 * an empty-tags check never sees those rows again. Most-recent first. */
export function buildUnscoredItemsQuery(limit = BACKFILL_SCORE_CAP): string {
  return `SELECT id, title, summary, published_at, items.tags, fetched_at,
                 ${RANK_SIGNAL_COLUMNS}
          FROM items ${RANK_SIGNAL_JOIN}
          WHERE status = 'published'
            AND llm_relevance IS NULL
          ORDER BY published_at DESC
          LIMIT ${limit}`;
}

/** HuggingNews items don't have their slug/topic stored separately — but
 * the item's own canonical url IS `https://huggingnews.com/<topic>/<slug>`,
 * so the detail page is just that url with `/__data.json` appended. */
export function huggingNewsDetailUrl(itemUrl: string): string {
  return `${itemUrl}/__data.json`;
}

export interface BackfillFetchResult {
  summary?: string;
  imageUrl?: string;
  mediaManifest?: MediaManifest;
}

export interface BackfillPlan {
  /** Null keeps the stored summary. */
  summary: string | null;
  imageUrl: string | null;
  mediaManifest: MediaManifest;
}

/**
 * Decides what to persist for a backfill candidate. Returns null when
 * nothing usable was fetched, or when the write would store exactly what the
 * row holds (a page whose only og:image is the one already stored); the
 * caller then only records the row as checked. Existing non-empty
 * image/media values win over freshly-fetched ones; this is the "never
 * overwrite an existing value" rule, expressed here without a database.
 */
export function planBackfillUpdate(
  existing: {
    summary?: string | null;
    imageUrl: string | null;
    mediaManifest?: string | null;
    articleUrl?: string | null;
  },
  fetched: BackfillFetchResult
): BackfillPlan | null {
  const fetchedSummary =
    typeof fetched.summary === "string" ? fetched.summary.trim() : "";
  const existingSummary =
    typeof existing.summary === "string" ? existing.summary.trim() : "";
  const existingManifest = parseMediaManifest(
    existing.mediaManifest,
    existing.imageUrl,
    existing.articleUrl
  );
  const fetchedManifest = parseMediaManifest(
    fetched.mediaManifest,
    fetched.imageUrl,
    existing.articleUrl
  );
  const hasFetchedMedia = fetchedManifest.assets.length > 0;
  if (!fetchedSummary && !hasFetchedMedia) return null;
  const manifest = buildMediaManifest(
    [...existingManifest.assets, ...fetchedManifest.assets],
    { articleUrls: [existing.articleUrl] }
  );
  const summary =
    preferCompleteSummary(existingSummary, fetchedSummary) ?? null;
  const imageUrl =
    primaryThumbnailUrl(
      existingManifest,
      existing.imageUrl,
      existing.articleUrl
    ) ??
    primaryThumbnailUrl(fetchedManifest, fetched.imageUrl, existing.articleUrl);
  const summaryChanged = summary !== (existingSummary || null);
  if (
    !summaryChanged &&
    imageUrl === (existing.imageUrl ?? null) &&
    serializeMediaManifest(manifest) === existing.mediaManifest
  ) {
    return null;
  }
  return {
    summary: summaryChanged ? summary : null,
    imageUrl,
    mediaManifest: manifest,
  };
}
