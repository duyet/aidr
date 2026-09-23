import type { DbReader } from "./db";
import { sanitizeImageUrl } from "./tldr-images";
import type { FeedItem } from "./types";

let llmTokensSupported: boolean | null = null;
let imageUrlSupported: boolean | null = null;

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

/** Look up a single published story by id (or id prefix). Shared by the
 * /api/story/$id route and the $slug permalink page loader. */
export async function getStory(
  db: DbReader,
  idPrefix: string
): Promise<FeedItem | null> {
  const [hasLlmTokens, hasImageUrl] = await Promise.all([
    probeColumn(db, "llm_tokens", llmTokensSupported),
    probeColumn(db, "image_url", imageUrlSupported),
  ]);
  llmTokensSupported = hasLlmTokens;
  imageUrlSupported = hasImageUrl;

  const itemSql = `SELECT i.id, i.url, i.title, t.title AS title_vi, i.summary,
              t.summary AS summary_vi, i.category, i.published_at,
              i.points, i.comments, i.rank_score, i.source_id, i.tags
              ${hasLlmTokens ? ", COALESCE(i.llm_tokens, 0) AS llm_tokens" : ""}
              ${hasImageUrl ? ", i.image_url" : ""}
       FROM items i
       LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
       WHERE substr(i.id, 1, ?) = ? AND i.status = 'published' LIMIT 1`;

  // item_sources is keyed by the full id, so the same substr-prefix
  // predicate lets both reads ride one db.batch — one D1 round-trip.
  // (substr instead of LIKE: a full 64-char id as a LIKE pattern exceeds
  // SQLite's pattern-complexity limit, D1_ERROR.)
  const sourcesSql = `SELECT item_id, kind, author, posted_at, quote, url
       FROM item_sources
       WHERE substr(item_id, 1, ?) = ? ORDER BY item_id, position`;

  let row: Record<string, unknown> | null | undefined;
  let sourceRows: ({ item_id: string } & FeedItem["sources"][number])[] = [];
  try {
    const [itemRes, sourcesRes] = await db.batch([
      db.prepare(itemSql).bind(idPrefix.length, idPrefix),
      db.prepare(sourcesSql).bind(idPrefix.length, idPrefix),
    ]);
    row = itemRes.results?.[0] as Record<string, unknown> | undefined;
    sourceRows = (sourcesRes.results ?? []) as typeof sourceRows;
  } catch {
    // item_sources may not exist yet (pre-migration) — the item still
    // resolves without sources via a fallback read.
    row = await db
      .prepare(itemSql)
      .bind(idPrefix.length, idPrefix)
      .first<Record<string, unknown>>();
  }
  if (!row) return null;

  let tags: string[] = [];
  try {
    tags = JSON.parse((row.tags as string) || "[]");
  } catch {
    // malformed tags — untagged
  }
  const item = {
    ...row,
    tags,
    sources: [],
    llm_tokens: (row.llm_tokens as number | undefined) ?? 0,
    image_url: sanitizeImageUrl(row.image_url as string | null | undefined),
  } as unknown as FeedItem;

  // The prefix predicate could match more than one item in principle —
  // keep only the resolved item's sources.
  item.sources = sourceRows
    .filter((r) => r.item_id === item.id)
    .map((r) => ({
      kind: r.kind,
      author: r.author,
      posted_at: r.posted_at,
      quote: r.quote,
      url: r.url,
    }));
  return item;
}
