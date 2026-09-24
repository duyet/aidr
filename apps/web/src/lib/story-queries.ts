import {
  boundedPublicManifest,
  canonicalizeMediaImageUrl,
  canonicalizeMediaUrl,
  MAX_PUBLIC_MEDIA_URL_LENGTH,
  manifestWithoutArticleUrl,
  parseMediaManifest,
  primaryThumbnailUrl,
} from "../../worker/media.js";
import type { DbReader } from "./db";
import type { FeedItem, ItemSource } from "./types";

const STORY_URL_MAX_LENGTH = 1024;

let llmTokensSupported: boolean | null = null;
let imageUrlSupported: boolean | null = null;
let mediaManifestSupported: boolean | null = null;

async function probeColumn(
  db: DbReader,
  column: string,
  cache: boolean | null
): Promise<boolean> {
  if (cache !== null) return cache;
  try {
    await db.prepare(`SELECT ${column} FROM items LIMIT 1`).all();
    return true;
  } catch {
    // column not migrated in yet
    return false;
  }
}

async function supportsMediaManifest(db: DbReader): Promise<boolean> {
  mediaManifestSupported = await probeColumn(
    db,
    "media_manifest",
    mediaManifestSupported
  );
  return mediaManifestSupported;
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
  const manifest = manifestWithoutArticleUrl(
    parseMediaManifest(
      asNullableString(row.media_manifest),
      legacyImageUrl
    ),
    rawArticleUrl
  );
  const exposedManifest = boundedPublicManifest(manifest);
  const articleUrl = canonicalizeMediaUrl(rawArticleUrl);
  const imageUrl = canonicalizeMediaImageUrl(
    primaryThumbnailUrl(manifest, legacyImageUrl, rawArticleUrl)
  );
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
    image_url:
      imageUrl && imageUrl.length <= MAX_PUBLIC_MEDIA_URL_LENGTH
        ? imageUrl
        : null,
    ...(exposedManifest ? { media_manifest: exposedManifest } : {}),
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
  const [hasLlmTokens, hasImageUrl, hasMediaManifest] = await Promise.all([
    probeColumn(db, "llm_tokens", llmTokensSupported),
    probeColumn(db, "image_url", imageUrlSupported),
    supportsMediaManifest(db),
  ]);
  llmTokensSupported = hasLlmTokens;
  imageUrlSupported = hasImageUrl;

  // The Markdown contract needs at most two rows to detect a prefix
  // collision. The number is clamped before interpolation, never user input.
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 2);
  const itemSql = `SELECT i.id, i.url, i.title, t.title AS title_vi, i.summary,
              t.summary AS summary_vi, i.category, i.published_at,
              i.points, i.comments, i.rank_score, i.source_id, i.tags
              ${hasLlmTokens ? ", COALESCE(i.llm_tokens, 0) AS llm_tokens" : ""}
              ${hasImageUrl ? ", i.image_url" : ""}
              ${hasMediaManifest ? ", i.media_manifest" : ""}
       FROM items i
       LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
       WHERE substr(i.id, 1, ?) = ? AND i.status = 'published' LIMIT ${limit}`;

  // item_sources is keyed by the full id, so the same predicate lets both
  // reads ride one db.batch — one D1 round-trip. Prefix matching uses substr
  // rather than LIKE because a full 64-char LIKE pattern can exceed SQLite's
  // pattern-complexity limit (D1_ERROR).
  const sourcesSql = `SELECT item_id, kind, author, posted_at, quote, url
       FROM item_sources
       WHERE substr(item_id, 1, ?) = ? ORDER BY item_id, position`;

  let rows: unknown[] = [];
  let sourceRows: Record<string, unknown>[] = [];
  try {
    const [itemRes, sourcesRes] = await db.batch([
      db.prepare(itemSql).bind(idPrefix.length, idPrefix),
      db.prepare(sourcesSql).bind(idPrefix.length, idPrefix),
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
      .bind(idPrefix.length, idPrefix)
      .all<Record<string, unknown>>();
    rows = Array.isArray(itemResult.results) ? itemResult.results : [];
    try {
      const sourceResult = await db
        .prepare(sourcesSql)
        .bind(idPrefix.length, idPrefix)
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
 * /api/story/$id route and the $slug permalink page loader. */
export async function getStory(
  db: DbReader,
  idPrefix: string
): Promise<FeedItem | null> {
  return (await queryStories(db, idPrefix, 1))[0] ?? null;
}

/** Lookup used by the Markdown route to reject ambiguous id prefixes. */
export async function getStoryCandidates(
  db: DbReader,
  idPrefix: string,
  limit = 2
): Promise<FeedItem[]> {
  return queryStories(db, idPrefix, limit);
}
