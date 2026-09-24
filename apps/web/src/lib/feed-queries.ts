import {
  boundedPublicManifest,
  canonicalizeMediaImageUrl,
  canonicalizeMediaUrl,
  MAX_PUBLIC_MEDIA_URL_LENGTH,
  manifestWithoutArticleUrl,
  parseMediaManifest,
  primaryThumbnailUrl,
} from "../../worker/media.js";
import { AUDIENCE_TIMEZONE, localCalendarDate } from "../../worker/time.js";
import {
  collectTrendingCandidates,
  ensureTopicLearningSchema,
  learnedKeywordsStmt,
  learningDayKey,
  rankTrendingWithGrowth,
  topicDailyCountsStmt,
} from "../../worker/topic-learning.js";
import type { DbReader } from "./db";
import { NEWEST_PUBLISHED_FETCHED_AT_SQL } from "./feed-freshness";
import { setLearnedKeywords } from "./highlight";
import { parseStoredBullets } from "./tldr-bullets";
import {
  resolveTldrForDisplay,
  shouldRebuildTldrForDisplay,
} from "./tldr-fallback";
import { imageUrlByItemId, withTldrImages } from "./tldr-images";
import type { DayGroup, FeedItem, FeedResponse } from "./types";

/** Hard serialized-body budget for the public feed endpoint. */
export const FEED_RESPONSE_MAX_BYTES = 1_000_000;
const FEED_TITLE_MAX = 512;
const FEED_SUMMARY_MAX = 4_000;
const FEED_TAG_MAX = 32;
const FEED_SOURCE_MAX = 8;
const FEED_SOURCE_TEXT_MAX = 512;
const FEED_SOURCE_URL_MAX_LENGTH = 1024;
const FEED_URL_MAX_LENGTH = 1024;

interface ItemRow {
  id: string;
  url: string;
  title: string;
  title_vi: string | null;
  summary: string | null;
  summary_vi: string | null;
  category: string | null;
  published_at: number;
  points: number;
  comments: number;
  rank_score: number;
  source_id: string;
  tags: string;
  llm_tokens?: number;
  image_url?: string | null;
  media_manifest?: string | null;
}

const ITEM_SELECT_BASE = `
  SELECT i.id, i.url, i.title, t.title AS title_vi, i.summary,
         t.summary AS summary_vi, i.category,
         i.published_at, i.points, i.comments, i.rank_score, i.source_id, i.tags{tokens}{image}{media}
  FROM items i
  LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
  WHERE i.status = 'published'
`;

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

async function supportsLlmTokens(db: DbReader): Promise<boolean> {
  llmTokensSupported = await probeColumn(db, "llm_tokens", llmTokensSupported);
  return llmTokensSupported;
}

async function supportsImageUrl(db: DbReader): Promise<boolean> {
  imageUrlSupported = await probeColumn(db, "image_url", imageUrlSupported);
  return imageUrlSupported;
}

async function supportsMediaManifest(db: DbReader): Promise<boolean> {
  mediaManifestSupported = await probeColumn(
    db,
    "media_manifest",
    mediaManifestSupported
  );
  return mediaManifestSupported;
}

function toFeedItem(row: ItemRow): FeedItem {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags || "[]");
  } catch {
    // malformed tags JSON from an old pipeline run — treat as untagged
  }
  const { media_manifest: rawManifest, ...item } = row;
  const manifest = manifestWithoutArticleUrl(
    parseMediaManifest(rawManifest, row.image_url),
    row.url
  );
  const exposedManifest = boundedPublicManifest(manifest);
  const articleUrl = canonicalizeMediaUrl(row.url);
  return {
    ...item,
    url:
      articleUrl && articleUrl.length <= FEED_URL_MAX_LENGTH ? articleUrl : "",
    tags,
    sources: [],
    llm_tokens: row.llm_tokens ?? 0,
    image_url: (() => {
      const imageUrl = canonicalizeMediaImageUrl(
        primaryThumbnailUrl(manifest, row.image_url, row.url)
      );
      return imageUrl && imageUrl.length <= MAX_PUBLIC_MEDIA_URL_LENGTH
        ? imageUrl
        : null;
    })(),
    ...(exposedManifest ? { media_manifest: exposedManifest } : {}),
  };
}

interface SourceRow {
  item_id: string;
  kind: string;
  author: string | null;
  posted_at: number | null;
  quote: string | null;
  url: string | null;
}

/**
 * One batch for every read that follows the main query: the item_sources
 * chunks (chunked to stay under D1's bound-parameter limit) plus the two
 * topic-learning SELECTs. A single D1 round-trip for all of them. Any
 * statement failing (e.g. item_sources missing pre-migration) fails the
 * batch — the same empty fallbacks the individual callers had apply.
 */
async function attachSourcesAndTopics(
  db: DbReader,
  items: FeedItem[],
  yesterday: string
): Promise<{
  yesterdayCounts: Map<string, number>;
  learnedKeywords: string[];
}> {
  let learnedKeywords: string[] = [];
  let yesterdayCounts = new Map<string, number>();
  const byId = new Map(items.map((i) => [i.id, i]));
  const ids = [...byId.keys()];
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const placeholders = chunk.map(() => "?").join(",");
    stmts.push(
      db
        .prepare(
          `SELECT item_id, kind, author, posted_at, quote, url FROM item_sources
           WHERE item_id IN (${placeholders}) ORDER BY item_id, position`
        )
        .bind(...chunk)
    );
  }
  const sourceStmtCount = stmts.length;
  stmts.push(learnedKeywordsStmt(db), topicDailyCountsStmt(db, yesterday));
  try {
    const batched = await db.batch(stmts);
    for (const res of batched.slice(0, sourceStmtCount)) {
      for (const row of (res.results ?? []) as SourceRow[]) {
        const sourceUrl = canonicalizeMediaUrl(row.url);
        byId.get(row.item_id)?.sources.push({
          kind: row.kind,
          author: row.author,
          posted_at: row.posted_at,
          quote: row.quote,
          url:
            sourceUrl && sourceUrl.length <= FEED_SOURCE_URL_MAX_LENGTH
              ? sourceUrl
              : null,
        });
      }
    }
    learnedKeywords = (
      (batched[sourceStmtCount]?.results ?? []) as { keyword: string }[]
    ).map((r) => r.keyword);
    yesterdayCounts = new Map(
      (
        (batched[sourceStmtCount + 1]?.results ?? []) as {
          topic: string;
          count: number;
        }[]
      ).map((r) => [r.topic, r.count])
    );
  } catch {
    // item_sources table may not exist yet (pre-migration) — feed still works
  }
  return { yesterdayCounts, learnedKeywords };
}

function groupByDay(items: FeedItem[]): DayGroup[] {
  const map = new Map<string, FeedItem[]>();
  for (const item of items) {
    const date = new Date(item.published_at * 1000).toISOString().slice(0, 10);
    const list = map.get(date) ?? [];
    list.push(item);
    map.set(date, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, dayItems]) => {
      dayItems.sort((a, b) => b.rank_score - a.rank_score);
      const categoryCounts: Record<string, number> = {};
      for (const it of dayItems) {
        if (it.category)
          categoryCounts[it.category] = (categoryCounts[it.category] ?? 0) + 1;
      }
      return { date, items: dayItems, categoryCounts };
    });
}

function feedResponseBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function cloneFeedResponse(feed: FeedResponse): FeedResponse {
  return {
    ...feed,
    tldr: feed.tldr
      ? {
          ...feed.tldr,
          bullets_en: feed.tldr.bullets_en.map((bullet) => ({ ...bullet })),
          bullets_vi: feed.tldr.bullets_vi.map((bullet) => ({ ...bullet })),
        }
      : null,
    days: feed.days.map((day) => ({
      ...day,
      items: day.items.map((item) => ({
        ...item,
        tags: [...item.tags],
        sources: item.sources.map((source) => ({ ...source })),
      })),
      categoryCounts: { ...day.categoryCounts },
    })),
    categories: feed.categories.map((category) => ({ ...category })),
    trending: feed.trending.map((trend) => ({ ...trend })),
    learnedKeywords: feed.learnedKeywords
      ? [...feed.learnedKeywords]
      : undefined,
  };
}

/** Keep the external feed shape valid under hostile/stale stored text. */
export function boundFeedResponse(feed: FeedResponse): FeedResponse {
  const bounded = cloneFeedResponse(feed);
  if (feedResponseBytes(bounded) <= FEED_RESPONSE_MAX_BYTES) return bounded;

  // Media is additive, so remove it first while preserving every story's
  // legacy thumbnail and all required fields.
  for (const day of bounded.days) {
    for (const item of day.items) delete item.media_manifest;
  }
  if (feedResponseBytes(bounded) <= FEED_RESPONSE_MAX_BYTES) return bounded;

  // Then bound variable text/source fields. This keeps the normal 360KB feed
  // untouched while guaranteeing a hard ceiling for a corrupt oversized row.
  for (const day of bounded.days) {
    for (const item of day.items) {
      item.title = item.title.slice(0, FEED_TITLE_MAX);
      item.title_vi = item.title_vi?.slice(0, FEED_TITLE_MAX) ?? null;
      item.summary = item.summary?.slice(0, FEED_SUMMARY_MAX) ?? null;
      item.summary_vi = item.summary_vi?.slice(0, FEED_SUMMARY_MAX) ?? null;
      item.category = item.category?.slice(0, 64) ?? null;
      item.tags = item.tags.slice(0, FEED_TAG_MAX);
      item.sources = item.sources.slice(0, FEED_SOURCE_MAX).map((source) => ({
        ...source,
        quote: source.quote?.slice(0, FEED_SOURCE_TEXT_MAX) ?? null,
        url: source.url && source.url.length <= 2_048 ? source.url : null,
      }));
    }
  }
  for (const language of ["bullets_en", "bullets_vi"] as const) {
    for (const bullet of bounded.tldr?.[language] ?? []) {
      delete bullet.image_url;
    }
  }
  if (feedResponseBytes(bounded) <= FEED_RESPONSE_MAX_BYTES) return bounded;

  // The existing query is already capped at 500 rows. Drop the oldest tail
  // in chunks only as a final fail-closed guard; metadata remains truthful
  // about the fetched window and the caller can request an older page.
  let remaining = bounded.days.reduce(
    (total, day) => total + day.items.length,
    0
  );
  while (remaining > 0) {
    const day = bounded.days[bounded.days.length - 1];
    if (!day) break;
    const remove = Math.min(32, day.items.length);
    day.items.splice(day.items.length - remove, remove);
    remaining -= remove;
    if (day.items.length === 0) bounded.days.pop();
    if (
      remaining === 0 ||
      remaining % 32 === 0 ||
      feedResponseBytes(bounded) <= FEED_RESPONSE_MAX_BYTES
    ) {
      if (feedResponseBytes(bounded) <= FEED_RESPONSE_MAX_BYTES) {
        return bounded;
      }
    }
  }
  const minimal = {
    ...bounded,
    tldr: null,
    days: [],
    categories: bounded.categories.slice(0, 100),
    trending: bounded.trending.slice(0, 100),
    learnedKeywords: (bounded.learnedKeywords ?? []).slice(0, 100),
  };
  if (feedResponseBytes(minimal) <= FEED_RESPONSE_MAX_BYTES) return minimal;
  return {
    ...minimal,
    categories: [],
    trending: [],
    learnedKeywords: [],
    totalStories: 0,
    lastFetchedAt: null,
    hasMore: false,
  };
}

export async function getFeed(
  db: DbReader,
  opts: { category?: string; q?: string; days?: number; before?: string } = {}
): Promise<FeedResponse> {
  const days = opts.days ?? (opts.q ? 30 : 3);
  const until = opts.before
    ? Math.floor(Date.parse(`${opts.before}T00:00:00Z`) / 1000)
    : Math.floor(Date.now() / 1000);
  const since = until - days * 86400;

  const [hasLlmTokens, hasImageUrl, hasMediaManifest] = await Promise.all([
    supportsLlmTokens(db),
    supportsImageUrl(db),
    supportsMediaManifest(db),
  ]);
  const itemSelect = ITEM_SELECT_BASE.replace(
    "{tokens}",
    hasLlmTokens ? ", COALESCE(i.llm_tokens, 0) AS llm_tokens" : ""
  )
    .replace("{image}", hasImageUrl ? ", i.image_url" : "")
    .replace("{media}", hasMediaManifest ? ", i.media_manifest" : "");

  let sql = `${itemSelect} AND i.published_at >= ? AND i.published_at < ?`;
  const binds: unknown[] = [since, until];
  if (opts.category) {
    sql += " AND lower(i.category) = ?";
    binds.push(opts.category.toLowerCase());
  }
  if (opts.q) {
    sql += " AND (i.title LIKE ? OR t.title LIKE ?)";
    binds.push(`%${opts.q}%`, `%${opts.q}%`);
  }
  sql += " ORDER BY i.published_at DESC LIMIT 500";

  const nowMs = Date.now();
  const yesterday = learningDayKey(nowMs - 24 * 60 * 60 * 1000);

  // One batch, one D1 round-trip — each ~1.5s of latency otherwise. The
  // topic-learning DDL is module-cached and touches disjoint tables, so a
  // cold isolate runs it alongside this batch instead of serially.
  const [mainResults] = await Promise.all([
    db.batch([
      db.prepare(sql).bind(...binds),
      db
        .prepare(
          `SELECT category AS name, COUNT(*) AS count FROM items
         WHERE status = 'published' AND category IS NOT NULL AND published_at >= ? AND published_at < ?
         GROUP BY category ORDER BY count DESC`
        )
        .bind(since, until),
      db.prepare(
        "SELECT date, bullets_en, bullets_vi FROM tldr_snapshots ORDER BY date DESC LIMIT 1"
      ),
      db.prepare(NEWEST_PUBLISHED_FETCHED_AT_SQL),
      db
        .prepare(
          `SELECT 1 AS yes FROM items
         WHERE status = 'published' AND published_at < ?
         LIMIT 1`
        )
        .bind(since),
    ]),
    ensureTopicLearningSchema(db).catch(() => {
      // DDL is best-effort; the topic reads below fall back to empty.
    }),
  ]);
  const [itemsRes, catsRes, tldrRes, fetchedRes, olderRes] = mainResults;

  const items = ((itemsRes.results ?? []) as ItemRow[]).map(toFeedItem);
  // Sources chunks + learned keywords + yesterday's counts: one round-trip.
  const { yesterdayCounts, learnedKeywords } = await attachSourcesAndTopics(
    db,
    items,
    yesterday
  );
  setLearnedKeywords(learnedKeywords);

  // Trending: prefer versioned models / products extracted from titles
  // (GPT-6 Astra, Fable 5.1) over generic score themes (llm, agent).
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const { counts: tagCounts, displayByKey } = collectTrendingCandidates(
    items.map((it) => ({
      title: it.title,
      tags: it.tags,
      published_at: it.published_at,
      sourceCount: Math.max(1, it.sources.length),
    })),
    dayAgo
  );
  const trending = rankTrendingWithGrowth(tagCounts, yesterdayCounts).map(
    ({ tag, count }) => ({
      tag: displayByKey.get(tag) ?? tag,
      count,
    })
  );

  let tldr: FeedResponse["tldr"] = null;
  const tldrRow = tldrRes.results?.[0] as
    | { date: string; bullets_en: string; bullets_vi: string }
    | undefined;
  if (tldrRow) {
    try {
      tldr = {
        date: tldrRow.date,
        bullets_en: parseStoredBullets(JSON.parse(tldrRow.bullets_en)),
        bullets_vi: parseStoredBullets(JSON.parse(tldrRow.bullets_vi)),
      };
    } catch {
      // malformed snapshot — render feed without TL;DR
    }
  }

  const resolved = resolveTldrForDisplay(tldr, items);
  // Persist a rebuilt last-24h fallback so Telegram and the next request
  // see the ranked digest, not a leftover or English-copied bullets_vi.
  // Stamp created_at as already stale so the next ingest still tries the LLM.
  if (resolved && shouldRebuildTldrForDisplay(tldr, items)) {
    try {
      await db
        .prepare(
          `INSERT INTO tldr_snapshots (date, bullets_en, bullets_vi, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           bullets_en = excluded.bullets_en,
           bullets_vi = excluded.bullets_vi,
           created_at = excluded.created_at`
        )
        .bind(
          localCalendarDate(Date.now(), AUDIENCE_TIMEZONE),
          JSON.stringify(resolved.bullets_en),
          JSON.stringify(resolved.bullets_vi),
          Date.now() - 3 * 60 * 60 * 1000
        )
        .run();
    } catch {
      // read-time persist is best-effort — display still uses `resolved`
    }
  }

  return boundFeedResponse({
    tldr: withTldrImages(resolved, imageUrlByItemId(items)),
    days: groupByDay(items),
    categories: (catsRes.results ?? []) as { name: string; count: number }[],
    trending,
    learnedKeywords,
    totalStories: items.length,
    updatedAt: Date.now(),
    lastFetchedAt:
      (fetchedRes.results?.[0] as { last: number | null } | undefined)?.last ??
      null,
    hasMore: (olderRes.results ?? []).length > 0,
  });
}
