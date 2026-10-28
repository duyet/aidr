import { enSummarySql } from "../../worker/en-summary.js";
import { canonicalizeMediaUrl, publicStoryMedia } from "../../worker/media.js";
import { VOTE_NET_COLUMN, VOTE_NET_JOIN_I } from "../../worker/ranking.js";
import { READ_COUNT_COLUMN, readFactor } from "../../worker/reads.js";
import { sourceFamily } from "../../worker/source-diversity.js";
import {
  collectTrendingCandidates,
  learnedKeywordsStmt,
  learningDayKey,
  rankTrendingWithGrowth,
  readableLearnedKeywords,
  topicDailyCountsStmt,
} from "../../worker/topic-learning.js";
import { archiveDateOfSec, dayBoundsSec } from "./day-archive";
import { DAY_VIDEO_TITLE_MAX, type DayVideo, isYoutubeId } from "./day-video";
import type { DbReader } from "./db";
import { NEWEST_PUBLISHED_FETCHED_AT_SQL } from "./feed-freshness";
import { markStage } from "./request-timing";
import { parseStoredBullets } from "./tldr-bullets";
import { resolveTldrForDisplay } from "./tldr-fallback";
import { imageUrlByItemId, withTldrImages } from "./tldr-images";
import type { DayGroup, FeedItem, FeedResponse, Lang } from "./types";

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
  vote_net: number;
  llm_tokens: number;
  image_url: string | null;
  media_manifest: string | null;
  /** Read-ordered select only (`readOrder: true`). */
  read_count?: number;
  /** Collapsed select only (`detail: false`): summary/summary_vi come back
   * NULL and these say what the full select would have carried. */
  has_detail?: 0 | 1;
  source_count?: number;
}

const ITEM_SELECT_BASE = `
  SELECT i.id, i.url, i.title, t.title AS title_vi,
         {summary}, i.category,
         i.published_at, i.points, i.comments, i.rank_score, i.source_id, i.tags,
         COALESCE(i.llm_tokens, 0) AS llm_tokens, i.image_url, i.media_manifest,
         ${VOTE_NET_COLUMN}{reads}{detail}
  FROM items i
  ${VOTE_NET_JOIN_I}
  LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
  WHERE i.status = 'published'
`;

const SUMMARY_COLUMNS = `${enSummarySql("i")} AS summary,
         t.summary AS summary_vi`;

/** Same NULL placeholders in the same positions so a collapsed row has the
 * key order of a full one. `has_detail` must agree with `stripItemDetail`
 * on the full row: a non-empty summary in either language or any source. */
const COLLAPSED_COLUMNS = `NULL AS summary, NULL AS summary_vi`;
const DETAIL_COLUMNS = `,
         CASE WHEN COALESCE(${enSummarySql("i")}, '') != ''
                OR COALESCE(t.summary, '') != ''
                OR EXISTS (SELECT 1 FROM item_sources s WHERE s.item_id = i.id)
              THEN 1 ELSE 0 END AS has_detail,
         (SELECT COUNT(*) FROM item_sources s WHERE s.item_id = i.id) AS source_count`;

interface ItemSelectFlags {
  /** Homepage only: select today's and yesterday's opens as `read_count`. */
  reads: boolean;
  /** false: no summary text, `has_detail` + `source_count` instead. */
  detail: boolean;
}

function itemSelectSql({ reads, detail }: ItemSelectFlags): string {
  return ITEM_SELECT_BASE.replace(
    "{summary}",
    detail ? SUMMARY_COLUMNS : COLLAPSED_COLUMNS
  )
    .replace("{detail}", detail ? "" : DETAIL_COLUMNS)
    .replace("{reads}", reads ? `, ${READ_COUNT_COLUMN}` : "");
}

function toFeedItem(row: ItemRow, detail = true): FeedItem {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags || "[]");
  } catch {
    // malformed tags JSON from an old pipeline run — treat as untagged
  }
  const {
    media_manifest: rawManifest,
    read_count: _reads,
    has_detail: hasDetail = 0,
    source_count: _sourceCount,
    ...item
  } = row;
  const media = publicStoryMedia(rawManifest, row.image_url, row.url);
  const articleUrl = canonicalizeMediaUrl(row.url);
  return {
    ...item,
    url:
      articleUrl && articleUrl.length <= FEED_URL_MAX_LENGTH ? articleUrl : "",
    tags,
    sources: [],
    llm_tokens: row.llm_tokens ?? 0,
    image_url: media.image_url,
    ...(media.media_manifest ? { media_manifest: media.media_manifest } : {}),
    vote_net: typeof row.vote_net === "number" ? row.vote_net : 0,
    ...(detail
      ? {}
      : { summary: null, summary_vi: null, lazyDetail: hasDetail === 1 }),
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

/** One line per feed read for `wrangler tail`: where D1 answered from
 * (primary vs replica) and the wall time of each round trip, so a far
 * colo's miss can be read off the logs instead of inferred. */
function logFeedBatch(
  itemsRes: D1Result | undefined,
  timing: { batchMs: number; detail: boolean }
): void {
  const meta = (itemsRes?.meta ?? {}) as {
    duration?: number;
    rows_read?: number;
    served_by_region?: string;
    served_by_primary?: boolean;
  };
  console.log(
    JSON.stringify({
      event: "getFeed.batch",
      batch_ms: timing.batchMs,
      d1_ms: meta.duration,
      rows_read: meta.rows_read,
      region: meta.served_by_region,
      primary: meta.served_by_primary,
      detail: timing.detail,
    })
  );
}

/** Statement order in the feed batch. `sources` is only present for a
 * full feed (`detail: true`); a collapsed feed never moves sources out of
 * D1. */
const FEED_BATCH = {
  items: 0,
  categories: 1,
  tldr: 2,
  fetchedAt: 3,
  older: 4,
  learnedKeywords: 5,
  topicDaily: 6,
  sources: 7,
} as const;

function attachSourcesAndTopics(
  batched: D1Result[],
  items: FeedItem[]
): { yesterdayCounts: Map<string, number>; learnedKeywords: string[] } {
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const row of (batched[FEED_BATCH.sources]?.results ??
    []) as SourceRow[]) {
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
  const learnedKeywords = readableLearnedKeywords(
    (batched[FEED_BATCH.learnedKeywords]?.results ?? []) as {
      keyword: string;
    }[]
  );
  const yesterdayCounts = new Map(
    (
      (batched[FEED_BATCH.topicDaily]?.results ?? []) as {
        topic: string;
        count: number;
      }[]
    ).map((r) => [r.topic, r.count])
  );
  return { yesterdayCounts, learnedKeywords };
}

/** `readCounts` (homepage only) multiplies each story's stored rank_score by
 * `readFactor` for the in-day sort. Nothing else sees the product. */
function groupByDay(
  items: FeedItem[],
  readCounts?: ReadonlyMap<string, number>
): DayGroup[] {
  const order = (it: FeedItem) =>
    it.rank_score * readFactor(readCounts?.get(it.id));
  const map = new Map<string, FeedItem[]>();
  for (const item of items) {
    // Audience-zone day, the same key `/date/YYYY-MM-DD` uses. A UTC date
    // files 17:00Z–24:00Z publishes on the previous day, and the Full day
    // link then opens an archive window that does not contain the story.
    const date = archiveDateOfSec(item.published_at);
    if (!date) continue;
    const list = map.get(date) ?? [];
    list.push(item);
    map.set(date, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, dayItems]) => {
      dayItems.sort((a, b) => order(b) - order(a));
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

export const FEED_MAX_DAYS = 14;
const BEFORE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The one place the feed window is validated, shared by `GET /api/feed` and
 * the RSS document so the two can never drift: `days` is clamped to 1–14 and
 * a malformed or absent `before` becomes `undefined` (i.e. "up to now")
 * rather than being passed to `Date.parse`.
 */
export function feedDaysAndBefore(search: URLSearchParams): {
  days?: number;
  before?: string;
} {
  const daysRaw = search.get("days");
  const days = daysRaw ? Number.parseInt(daysRaw, 10) : Number.NaN;
  const before = search.get("before") ?? undefined;
  return {
    days:
      Number.isFinite(days) && days > 0
        ? Math.min(days, FEED_MAX_DAYS)
        : undefined,
    before: before && BEFORE_DATE_RE.test(before) ? before : undefined,
  };
}

/** No single source family may hold more than this share of the served
 *  feed (family = catalog `family`, else the source id). */
export const FEED_MAX_SOURCE_SHARE = 0.25;
/** Below this many distinct families a 25% cap is unsatisfiable, so skip it. */
const FEED_SHARE_CAP_MIN_SOURCES = 4;

/**
 * Enforce the per-family share cap on the selected rows. Mirrored sources
 * (huggingnews + marketbrief) share one family, so the pair cannot hold
 * twice the share. Each family keeps its highest-`rank_score` items up to
 * the largest per-family count `c` with
 * `c <= share * sum(min(count_s, c))`. Read-time on purpose: the ingest flood
 * gate only bounds new rows, so historic rows from a firehose still need
 * this. Input order is preserved.
 */
export function capSourceShare<
  T extends { source_id: string; rank_score: number },
>(items: T[], share = FEED_MAX_SOURCE_SHARE): T[] {
  const byFamily = new Map<string, T[]>();
  for (const it of items) {
    const family = sourceFamily(it.source_id);
    const list = byFamily.get(family) ?? [];
    list.push(it);
    byFamily.set(family, list);
  }
  if (byFamily.size < FEED_SHARE_CAP_MIN_SOURCES) return items;
  const sizes = [...byFamily.values()].map((l) => l.length);
  let cap = Math.max(...sizes);
  while (cap > 1) {
    const total = sizes.reduce((sum, n) => sum + Math.min(n, cap), 0);
    if (cap <= share * total) break;
    cap--;
  }
  const keep = new Set<T>();
  for (const list of byFamily.values()) {
    for (const it of [...list]
      .sort((a, b) => b.rank_score - a.rank_score)
      .slice(0, cap)) {
      keep.add(it);
    }
  }
  return items.filter((it) => keep.has(it));
}

export async function getFeed(
  db: DbReader,
  opts: {
    category?: string;
    q?: string;
    days?: number;
    before?: string;
    /** Homepage only: order each day by rank_score x `readFactor`. Rows,
     * membership, the TL;DR fallback and rank_score itself stay stored. */
    readOrder?: boolean;
    /** false (homepage SSR): rows arrive collapsed, as `stripItemDetail`
     * would leave them, without moving summaries or sources out of D1. */
    detail?: boolean;
  } = {}
): Promise<FeedResponse> {
  const detail = opts.detail ?? true;
  const days = opts.days ?? (opts.q ? 30 : 3);
  // `before` is the audience-zone day `groupByDay` emits. Cut at that day's
  // ICT midnight so the next page does not bisect a Vietnam day.
  const until = opts.before
    ? dayBoundsSec(opts.before).start
    : Math.floor(Date.now() / 1000);
  const since = until - days * 86400;

  const hasReads = opts.readOrder === true;
  const itemSelect = itemSelectSql({ reads: hasReads, detail });

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

  // One batch, one D1 round trip. A far colo pays roughly 300ms per trip to
  // the primary (measured from HKG), so nothing that follows the item query
  // may wait for its ids: sources select off the same item query instead.
  const stmts = [
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
    learnedKeywordsStmt(db),
    topicDailyCountsStmt(db, yesterday),
  ];
  if (detail) {
    stmts.push(
      db
        .prepare(
          `SELECT item_id, kind, author, posted_at, quote, url FROM item_sources
           WHERE item_id IN (SELECT id FROM (${sql})) ORDER BY item_id, position`
        )
        .bind(...binds)
    );
  }
  const batchStartedAt = Date.now();
  const batched = await db.batch(stmts);
  markStage("d1");
  const itemsRes = batched[FEED_BATCH.items];
  logFeedBatch(itemsRes, {
    batchMs: Date.now() - batchStartedAt,
    detail,
  });
  const catsRes = batched[FEED_BATCH.categories];
  const tldrRes = batched[FEED_BATCH.tldr];
  const fetchedRes = batched[FEED_BATCH.fetchedAt];
  const olderRes = batched[FEED_BATCH.older];

  const rows = (itemsRes.results ?? []) as ItemRow[];
  const items = capSourceShare(rows.map((row) => toFeedItem(row, detail)));
  const readCounts = hasReads
    ? new Map(rows.map((row) => [row.id, row.read_count ?? 0]))
    : undefined;
  const sourceCounts = detail
    ? undefined
    : new Map(rows.map((row) => [row.id, row.source_count ?? 0]));
  const { yesterdayCounts, learnedKeywords } = attachSourcesAndTopics(
    batched,
    items
  );
  // Trending: prefer versioned models / products extracted from titles
  // (GPT-6 Astra, Fable 5.1) over generic score themes (llm, agent).
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const {
    counts: tagCounts,
    displayByKey,
    entityKeys,
  } = collectTrendingCandidates(
    items.map((it) => ({
      title: it.title,
      tags: it.tags,
      published_at: it.published_at,
      sourceCount: Math.max(
        1,
        sourceCounts ? (sourceCounts.get(it.id) ?? 0) : it.sources.length
      ),
    })),
    dayAgo
  );
  const trending = rankTrendingWithGrowth(tagCounts, yesterdayCounts, {
    entityKeys,
  }).map(({ tag, count }) => ({
    tag: displayByKey.get(tag) ?? tag,
    count,
  }));

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

  return boundFeedResponse({
    tldr: withTldrImages(
      resolveTldrForDisplay(tldr, items),
      imageUrlByItemId(items)
    ),
    days: groupByDay(items, readCounts),
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

/** Published stories by exact id, in the order of `ids` (missing or
 * unpublished ids are left out). Collapsed rows, like the day archive. */
export async function getItemsByIds(
  db: DbReader,
  ids: readonly string[]
): Promise<FeedItem[]> {
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(
      `${itemSelectSql({ reads: false, detail: true })} AND i.id IN (SELECT value FROM json_each(?))`
    )
    .bind(JSON.stringify(ids))
    .all<ItemRow>();
  const byId = new Map((results ?? []).map((row) => [row.id, toFeedItem(row)]));
  return ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

/** Hard ceiling on one day archive page; a real day is well under this. */
export const DAY_ARCHIVE_ITEM_LIMIT = 500;

export interface DayArchive {
  date: string;
  /** That day's stories ranked like the feed's day group; null when none. */
  day: DayGroup | null;
  /** The `tldr_snapshots` row with this exact date, if any. */
  tldr: FeedResponse["tldr"];
  /** Per language; one never stands in for the other. */
  videos: Record<Lang, DayVideo | null>;
  /** Nearest earlier / later audience-zone day with a published story. */
  prevDate: string | null;
  nextDate: string | null;
  /** ISO week of this day when that week has a weekly edition; set by the
   * page loader only, so the link never points at a 404. */
  week?: string | null;
}

function parseDayVideoColumns(
  youtube: unknown,
  short: unknown,
  title: unknown
): DayVideo | null {
  const youtubeId = isYoutubeId(youtube) ? youtube : null;
  const shortId = isYoutubeId(short) ? short : null;
  if (!youtubeId && !shortId) return null;
  return {
    youtube_id: youtubeId,
    short_id: shortId,
    title:
      typeof title === "string" && title.trim()
        ? title.trim().slice(0, DAY_VIDEO_TITLE_MAX)
        : null,
  };
}

export function parseDayVideoRow(row: unknown): Record<Lang, DayVideo | null> {
  const r = (row && typeof row === "object" ? row : {}) as Record<
    string,
    unknown
  >;
  return {
    en: parseDayVideoColumns(r.youtube_id, r.short_id, r.title),
    vi: parseDayVideoColumns(r.youtube_id_vi, r.short_id_vi, r.title_vi),
  };
}

/**
 * Read-only archive of one audience-zone (ICT) day: its published stories (bounded), the
 * snapshot stored under that date, the optional day video, and the nearest
 * neighbouring days. Like `getFeed` it never writes: an archive read must
 * not rebuild or persist a TL;DR snapshot. No source-share cap — the page
 * lists the whole day.
 */
export async function getDayArchive(
  db: DbReader,
  date: string
): Promise<DayArchive> {
  const { start, end } = dayBoundsSec(date);
  const itemSelect = itemSelectSql({ reads: false, detail: true });

  const [itemsRes, tldrRes, prevRes, nextRes, videoRes] = await db.batch([
    db
      .prepare(
        `${itemSelect} AND i.published_at >= ? AND i.published_at < ?
         ORDER BY i.rank_score DESC LIMIT ${DAY_ARCHIVE_ITEM_LIMIT}`
      )
      .bind(start, end),
    db
      .prepare(
        "SELECT date, bullets_en, bullets_vi FROM tldr_snapshots WHERE date = ? LIMIT 1"
      )
      .bind(date),
    db
      .prepare(
        `SELECT MAX(published_at) AS at FROM items
         WHERE status = 'published' AND published_at < ?`
      )
      .bind(start),
    db
      .prepare(
        `SELECT MIN(published_at) AS at FROM items
         WHERE status = 'published' AND published_at >= ?`
      )
      .bind(end),
    db
      .prepare(
        `SELECT youtube_id, short_id, title, youtube_id_vi, short_id_vi, title_vi
         FROM day_videos WHERE date = ? LIMIT 1`
      )
      .bind(date),
  ]);
  const videos = parseDayVideoRow(videoRes?.results?.[0]);

  const items = ((itemsRes.results ?? []) as ItemRow[]).map((row) =>
    toFeedItem(row)
  );
  let tldr: FeedResponse["tldr"] = null;
  const tldrRow = tldrRes.results?.[0] as
    | { date: string; bullets_en: string; bullets_vi: string }
    | undefined;
  if (tldrRow) {
    try {
      tldr = withTldrImages(
        {
          date: tldrRow.date,
          bullets_en: parseStoredBullets(JSON.parse(tldrRow.bullets_en)),
          bullets_vi: parseStoredBullets(JSON.parse(tldrRow.bullets_vi)),
        },
        imageUrlByItemId(items)
      );
    } catch {
      // malformed snapshot — the day still lists its stories
    }
  }

  const neighbour = (res: D1Result | undefined): string | null => {
    const at = (res?.results?.[0] as { at: number | null } | undefined)?.at;
    return typeof at === "number" ? archiveDateOfSec(at) : null;
  };
  // One group for the requested audience-zone day. The query window is
  // already that day. Stored rank_score descending, without the feed's
  // read boost: the Telegram day card is painted from this order.
  const categoryCounts: Record<string, number> = {};
  for (const it of items) {
    if (it.category)
      categoryCounts[it.category] = (categoryCounts[it.category] ?? 0) + 1;
  }
  const bounded = boundFeedResponse({
    tldr,
    days:
      items.length > 0
        ? [
            {
              date,
              items: [...items].sort((a, b) => b.rank_score - a.rank_score),
              categoryCounts,
            },
          ]
        : [],
    categories: [],
    trending: [],
    totalStories: items.length,
    updatedAt: 0,
    lastFetchedAt: null,
    hasMore: false,
  });
  return {
    date,
    day: bounded.days[0] ?? null,
    tldr: bounded.tldr,
    videos,
    prevDate: neighbour(prevRes),
    nextDate: neighbour(nextRes),
  };
}
