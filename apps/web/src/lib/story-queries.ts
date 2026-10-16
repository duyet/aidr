import { enSummarySql } from "../../worker/en-summary.js";
import { canonicalizeMediaUrl, publicStoryMedia } from "../../worker/media.js";
import { VOTE_NET_COLUMN, VOTE_NET_JOIN_I } from "../../worker/ranking.js";
import type { DbReader } from "./db";
import type { ContentLogEntry, FeedItem, ItemSource } from "./types";

const STORY_URL_MAX_LENGTH = 1024;

/**
 * Index-friendly id-prefix predicate. `substr(col, 1, n) = ?` alone cannot use
 * the `items` primary key or `idx_item_sources_item`, so every story lookup
 * scanned both tables (2026-10 D1 analytics: ~70% of all rows read). The
 * half-open range `[prefix, prefix || U+FFFF)` lets SQLite seek the index
 * under BINARY collation (ids are ASCII hex, so every id starting with the
 * prefix sorts inside it); the trailing `substr` keeps the match exact.
 * Binds: (prefix, prefix + U+FFFF, prefix.length, prefix).
 */
export function idPrefixPredicate(column: string): string {
  return `${column} >= ? AND ${column} < ? AND substr(${column}, 1, ?) = ?`;
}

export function idPrefixBinds(
  prefix: string
): [string, string, number, string] {
  return [prefix, `${prefix}\uffff`, prefix.length, prefix];
}

function parseTags(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    // malformed tags — untagged
    return [];
  }
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mapStoryRow(
  row: Record<string, unknown>,
  sourceRows: Record<string, unknown>[]
): FeedItem | null {
  const id = asString(row.id);
  if (!id) return null;
  const rawArticleUrl = asString(row.url);
  const legacyImageUrl = asNullableString(row.image_url);
  const media = publicStoryMedia(
    asNullableString(row.media_manifest),
    legacyImageUrl,
    rawArticleUrl
  );
  const articleUrl = canonicalizeMediaUrl(rawArticleUrl);
  const item: FeedItem = {
    id,
    url:
      articleUrl && articleUrl.length <= STORY_URL_MAX_LENGTH ? articleUrl : "",
    title: asString(row.title, "Untitled story"),
    title_vi: asNullableString(row.title_vi),
    summary: asNullableString(row.summary),
    summary_vi: asNullableString(row.summary_vi),
    category: asNullableString(row.category),
    published_at: asNumber(row.published_at, Number.NaN),
    points: asNumber(row.points),
    comments: asNumber(row.comments),
    rank_score: asNumber(row.rank_score),
    source_id: asString(row.source_id),
    tags: parseTags(row.tags),
    sources: [],
    llm_tokens: asNumber(row.llm_tokens),
    vote_net: asNumber(row.vote_net),
    image_url: media.image_url,
    ...(media.media_manifest ? { media_manifest: media.media_manifest } : {}),
  };

  item.sources = sourceRows
    .filter((source) => source.item_id === id)
    .map((source): ItemSource => {
      const sourceUrl = canonicalizeMediaUrl(source.url);
      return {
        kind: asString(source.kind, "source"),
        author: asNullableString(source.author),
        posted_at:
          typeof source.posted_at === "number" &&
          Number.isFinite(source.posted_at)
            ? source.posted_at
            : null,
        quote: asNullableString(source.quote),
        url:
          sourceUrl && sourceUrl.length <= STORY_URL_MAX_LENGTH
            ? sourceUrl
            : null,
      };
    });
  return item;
}

async function queryStories(
  db: DbReader,
  idPrefix: string,
  requestedLimit: number
): Promise<FeedItem[]> {
  // The Markdown contract needs at most two rows to detect a prefix
  // collision. The number is clamped before interpolation, never user input.
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 2);
  const itemSql = `SELECT i.id, i.url, i.title, t.title AS title_vi,
              ${enSummarySql("i")} AS summary,
              t.summary AS summary_vi, i.category, i.published_at,
              i.points, i.comments, i.rank_score, i.source_id, i.tags,
              COALESCE(i.llm_tokens, 0) AS llm_tokens, i.image_url,
              i.media_manifest, ${VOTE_NET_COLUMN}
       FROM items i
       ${VOTE_NET_JOIN_I}
       LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
       WHERE ${idPrefixPredicate("i.id")} AND i.status = 'published' LIMIT ${limit}`;

  // item_sources is keyed by the full id, so the same predicate lets both
  // reads ride one db.batch — one D1 round-trip. Prefix matching never uses
  // LIKE: a full 64-char LIKE pattern can exceed SQLite's pattern-complexity
  // limit (D1_ERROR). See idPrefixPredicate for why it is a range.
  const sourcesSql = `SELECT item_id, kind, author, posted_at, quote, url
       FROM item_sources
       WHERE ${idPrefixPredicate("item_id")} ORDER BY item_id, position`;

  let rows: unknown[] = [];
  let sourceRows: Record<string, unknown>[] = [];
  try {
    const [itemRes, sourcesRes] = await db.batch([
      db.prepare(itemSql).bind(...idPrefixBinds(idPrefix)),
      db.prepare(sourcesSql).bind(...idPrefixBinds(idPrefix)),
    ]);
    rows = Array.isArray(itemRes.results) ? itemRes.results : [];
    sourceRows = Array.isArray(sourcesRes.results)
      ? (sourcesRes.results as Record<string, unknown>[])
      : [];
  } catch {
    // item_sources may not exist yet (pre-migration) — the item still
    // resolves without sources via a fallback read.
    const itemResult = await db
      .prepare(itemSql)
      .bind(...idPrefixBinds(idPrefix))
      .all<Record<string, unknown>>();
    rows = Array.isArray(itemResult.results) ? itemResult.results : [];
    try {
      const sourceResult = await db
        .prepare(sourcesSql)
        .bind(...idPrefixBinds(idPrefix))
        .all<Record<string, unknown>>();
      sourceRows = Array.isArray(sourceResult.results)
        ? sourceResult.results
        : [];
    } catch {
      // Sources are optional during a rolling migration.
    }
  }

  return rows
    .filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object"
    )
    .map((row) => mapStoryRow(row, sourceRows))
    .filter((item): item is FeedItem => item !== null)
    .slice(0, limit);
}

/** Look up a single published story by id (or id prefix). Shared by the
 * /api/story/$id route and the $slug permalink page loader. A merged item
 * resolves to the story it was merged into: an aggregator canonical that an
 * official post later replaced (`MergePlan.demoted`) keeps its shared
 * links, and the permalink loader redirects them to the new canonical. */
const CONTENT_LOG_SQL = `SELECT field, lang, before_text, after_text, reason, created_at
FROM item_content_log
WHERE item_id = ?
ORDER BY created_at DESC, id DESC
LIMIT 12`;

async function attachContentLog(
  db: DbReader,
  story: FeedItem
): Promise<FeedItem> {
  try {
    const { results } = await db.prepare(CONTENT_LOG_SQL).bind(story.id).all<{
      field: string;
      lang: string;
      before_text: string | null;
      after_text: string | null;
      reason: string;
      created_at: number;
    }>();
    const content_log: ContentLogEntry[] = (results ?? []).flatMap((row) =>
      row.field === "title" || row.field === "summary"
        ? [
            {
              field: row.field,
              lang: row.lang,
              before_text: row.before_text,
              after_text: row.after_text,
              reason: row.reason,
              created_at: Number(row.created_at) || 0,
            },
          ]
        : []
    );
    return { ...story, content_log };
  } catch {
    // History is best-effort: a failed read still renders the story.
    return story;
  }
}

export async function getStory(
  db: DbReader,
  idPrefix: string
): Promise<FeedItem | null> {
  const stories = await queryStories(db, idPrefix, 2);
  // Two published rows share the prefix: refuse rather than guess. Zero
  // published rows still fall through to the merged lookup below.
  if (stories.length > 1) return null;
  const story = stories[0];
  if (story) return attachContentLog(db, story);
  const { results } = await db
    .prepare(
      `SELECT duplicate_of FROM items
       WHERE ${idPrefixPredicate("id")} AND status = 'merged'
         AND duplicate_of IS NOT NULL LIMIT 2`
    )
    .bind(...idPrefixBinds(idPrefix))
    .all<{ duplicate_of: string }>();
  // An ambiguous prefix resolves to nothing rather than to a guess.
  if (results?.length !== 1) return null;
  const canonical =
    (await queryStories(db, results[0].duplicate_of, 1))[0] ?? null;
  return canonical ? attachContentLog(db, canonical) : null;
}

const STORY_MEDIA_SQL = `SELECT id, url, image_url, media_manifest FROM items
WHERE id = ? AND status = 'published'`;

/** Images of one published story by full id: one primary-key read with no
 * joins, cheap enough for `/api/thumb` to run on every request. Null when
 * the story is gone or unpublished, or the read fails. */
export async function getStoryMedia(
  db: DbReader,
  id: string
): Promise<Pick<FeedItem, "image_url" | "media_manifest"> | null> {
  try {
    const row = await db
      .prepare(STORY_MEDIA_SQL)
      .bind(id)
      .first<Record<string, unknown>>();
    return row ? mapStoryRow(row, []) : null;
  } catch {
    return null;
  }
}

/** Lookup used by the Markdown route to reject ambiguous id prefixes. */
export async function getStoryCandidates(
  db: DbReader,
  idPrefix: string,
  limit = 2
): Promise<FeedItem[]> {
  return queryStories(db, idPrefix, limit);
}
