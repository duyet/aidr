import { firstImageUrl, serializeMediaManifest } from "./media.js";
import type {
  FetchedItem,
  FetchedItemSource,
  SourceLanguage,
} from "./sources/types.js";
import { toEpochSeconds } from "./time.js";

export const MAX_SOURCES_PER_ITEM = 8;
/** The combined 0023 translation and 0024 media item upsert arity. */
export const ITEM_BIND_ARITY = 22;
export const ITEM_SOURCE_LANG_BIND_INDEX = 20;
export const ITEM_MEDIA_MANIFEST_BIND_INDEX = 21;

/** D1's .bind() rejects `undefined`; coerce any optional/missing value to `null`. */
export function nn<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

/** Pure builder for the `items` upsert bind args, so it can be unit-tested without a D1 binding. */
export function buildItemBindArgs(args: {
  id: string;
  sourceId: string;
  item: FetchedItem;
  score?: {
    relevance?: number;
    importance?: number;
    quality?: number;
    category?: string;
    tags?: string[];
  };
  rank: number;
  status: string;
  now: number;
  llmTokens?: number;
  duplicateOf?: string;
}): unknown[] {
  const {
    id,
    sourceId,
    item,
    score,
    rank,
    status,
    now,
    llmTokens,
    duplicateOf,
  } = args;
  return [
    nn(id),
    nn(sourceId),
    nn(item.externalId),
    nn(item.url),
    nn(item.title),
    nn(item.summary),
    // Defense in depth: normalize to epoch seconds here regardless of what
    // unit the caller/adapter produced, so a bad upstream value can never
    // reach the database as milliseconds.
    nn(toEpochSeconds(item.publishedAt)),
    nn(toEpochSeconds(now)),
    nn(item.points ?? 0),
    nn(item.comments ?? 0),
    nn(score?.relevance),
    nn(score?.importance),
    nn(score?.quality),
    nn(score?.category),
    nn(JSON.stringify(score?.tags ?? [])),
    nn(rank),
    nn(status),
    nn(llmTokens ?? 0),
    nn(duplicateOf),
    nn(item.imageUrl ?? firstImageUrl(item.mediaManifest)),
    nn(item.sourceLang ?? "en"),
    serializeMediaManifest(item.mediaManifest),
  ];
}

export const TRANSLATION_BIND_ARITY = 6;

/** Pure builder for the explicit source/target translation upsert args. */
export function buildTranslationBindArgs(args: {
  id: string;
  lang?: SourceLanguage;
  sourceLang?: SourceLanguage;
  targetLang?: SourceLanguage;
  title: string | null;
  summary: string | null;
}): unknown[] {
  return [
    nn(args.id),
    nn(args.lang ?? "vi"),
    nn(args.sourceLang ?? "en"),
    nn(args.targetLang ?? "vi"),
    nn(args.title),
    nn(args.summary),
  ];
}

/** Every candidate write invalidates the previous semantic-review state. The
 *  durable attempt history remains, but the current-candidate marker is
 *  cleared so the item becomes eligible for review again. */
export const TRANSLATION_UPSERT_SQL = `INSERT INTO translations (
  item_id, lang, source_lang, target_lang, title, summary
)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(item_id, lang) DO UPDATE SET
    source_lang = excluded.source_lang,
    target_lang = excluded.target_lang,
    title = excluded.title,
    summary = excluded.summary,
    qa_rating = NULL,
    qa_at = NULL,
    qa_source_hash = NULL,
    qa_candidate_hash = NULL,
    qa_source_revision = NULL,
    qa_direction = NULL,
    qa_reviewer_model = NULL,
    qa_criteria_version = NULL`;

/** Source edits invalidate every candidate direction, including paths that do
 *  not emit a translation row. */
export const TRANSLATION_QA_INVALIDATION_SQL = `UPDATE translations SET
  qa_rating = NULL,
  qa_at = NULL,
  qa_source_hash = NULL,
  qa_candidate_hash = NULL,
  qa_source_revision = NULL,
  qa_direction = NULL,
  qa_reviewer_model = NULL,
  qa_criteria_version = NULL
WHERE item_id = ?`;

export function prepareTranslationUpsert(
  db: D1Database,
  args: {
    id: string;
    lang?: SourceLanguage;
    sourceLang?: SourceLanguage;
    targetLang?: SourceLanguage;
    title: string | null;
    summary: string | null;
  }
): D1PreparedStatement {
  return db
    .prepare(TRANSLATION_UPSERT_SQL)
    .bind(...buildTranslationBindArgs(args));
}

export function prepareTranslationQaInvalidation(
  db: D1Database,
  itemId: string
): D1PreparedStatement {
  return db.prepare(TRANSLATION_QA_INVALIDATION_SQL).bind(nn(itemId));
}

/**
 * Pure builder for `item_sources` insert bind args, one row per source,
 * capped at `MAX_SOURCES_PER_ITEM` and positioned 0..n in array order.
 * Adapters may emit `postedAt` in ms; normalized to seconds here, same as
 * `item.publishedAt` in buildItemBindArgs.
 */
export function buildItemSourceBindArgs(
  itemId: string,
  sources: FetchedItemSource[]
): unknown[][] {
  return sources
    .slice(0, MAX_SOURCES_PER_ITEM)
    .map((source, position) => [
      nn(itemId),
      nn(position),
      nn(source.kind),
      nn(source.author),
      source.postedAt === undefined
        ? null
        : nn(toEpochSeconds(source.postedAt)),
      nn(source.quote),
      nn(source.url),
    ]);
}
