/**
 * Public RSS 2.0 document at `/feed.xml` (with a `/rss.xml` byte-identical
 * alias). This is the syndication surface: the single highest-leverage
 * discovery entry point for a news aggregator, and the one that was missing.
 *
 * Design constraints, in the order they mattered:
 *
 *  1. One feed query. The document is rendered from the existing `getFeed`
 *     loader (already bounded: `days` clamped to 1–14, `before` validated,
 *     `boundFeedResponse` byte-budgeted) and never a parallel D1 query. A
 *     second reader would drift from the product feed.
 *  2. One locale gate. `resolveApiRequestLocale` / `localeCacheControl` are
 *     reused verbatim, so `/feed.xml` behaves exactly like `/api/feed`:
 *     bare = cookie/Accept-Language selected and `private, no-store` +
 *     `Vary: Cookie, Accept-Language`; explicit `lang` = public cacheable;
 *     one legacy `locale` = a single 307 to `lang`; invalid/repeated/
 *     conflicting = 400.
 *  3. Hard bounds. An uncapped feed is an availability risk on the Free plan
 *     (a 10 MB response is a multi-second Worker CPU burn for every reader).
 *     Item count, per-field length, and total serialized bytes are each
 *     capped, and the byte cap is enforced while assembling the document so
 *     the response can never exceed it.
 *  4. Every `<item>` is self-consistent and canonical: the permalink carries
 *     an explicit `lang` (the only indexable form — see
 *     `LOCALE_URLS.md`), no UTM, no fragment; `<guid>` repeats it; the title
 *     and description are the rendered-locale values with their real stored
 *     fallback (never an invented translation); `<pubDate>` normalizes the
 *     epoch explicitly.
 */
import { isFetchableUrl } from "../../worker/enrich.js";
import { CATEGORIES } from "../../worker/llm.js";
import {
  canonicalizeMediaImageUrl,
  MAX_PUBLIC_MEDIA_URL_LENGTH,
} from "../../worker/media.js";
import { normalizeTopicName } from "../../worker/topics.js";
import { readSession } from "./db";
import { feedDaysAndBefore, getFeed } from "./feed-queries";
import { apiErrorResponse, resolveApiRequestLocale } from "./locale-response";
import { localeCacheControl } from "./locale-url";
import {
  RSS_FEED_PATH,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "./site";
import { escapeXml } from "./sitemap";
import { storyPath } from "./slug";
import type { FeedItem, FeedResponse, Lang } from "./types";

/** One canonical public feed; `/rss.xml` serves the identical document. */
export const RSS_CONTENT_TYPE = "application/rss+xml; charset=utf-8";
export const RSS_CACHE_CONTROL =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=1800";
/** Atom namespace for `rel="self"` only; aidr publishes no Atom document. */
export const ATOM_NAMESPACE = "http://www.w3.org/2005/Atom";
/** Media RSS for the validated story thumbnail. */
export const MEDIA_NAMESPACE = "http://search.yahoo.com/mrss/";

/**
 * Newest-N cap. 100 items is roughly a day of ranked output; readers paginate
 * or refetch, and the document stays well inside the byte budget below.
 */
export const RSS_ITEM_LIMIT = 100;
/** Mirrors `FEED_TITLE_MAX` in feed-queries.ts (boundFeedResponse). */
const RSS_TITLE_MAX = 512;
/**
 * Per-item description cap. `/api/public` clamps story text to 400 chars and
 * the JSON feed allows 4,000; RSS renders in narrow reader columns where a
 * long blob is truncated by the reader anyway, so 600 keeps the payload small
 * without cutting a sentence short in most feeds.
 */
export const RSS_DESCRIPTION_MAX = 600;
/** Category + topic elements per item, oldest-first capped below this. */
export const RSS_CATEGORY_LIMIT = 8;
/**
 * Hard serialized-body budget. 100 items × 600-char descriptions + escaped
 * markup + a 512-char title is ~150 KB in the worst case, so 256 KiB leaves
 * headroom while staying far below the 1 MB the JSON feed already serves and
 * far below what a shared edge cache should be asked to hold.
 */
export const RSS_MAX_BYTES = 262_144;

/** Values above this are epoch milliseconds, not seconds. */
const EPOCH_MS_THRESHOLD = 1e12;

/**
 * `published_at` is documented as epoch *seconds* (ALGORITHM.md § "Ingest
 * HTTP / D1 contract" records the seconds/ms bug class this repo already
 * shipped once). A millisecond row read as seconds renders as a year-2286
 * date in `<pubDate>` and in the news sitemap, so every timestamp that leaves
 * this module goes through this one normalizer.
 */
export function epochSeconds(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value > EPOCH_MS_THRESHOLD
    ? Math.floor(value / 1000)
    : Math.floor(value);
}

/** RFC-822 / RFC-1123 date, the format RSS 2.0 `<pubDate>` requires. */
export function rfc822Date(epoch: number | null | undefined): string {
  const seconds = epochSeconds(epoch);
  if (seconds <= 0) return "";
  return new Date(seconds * 1000).toUTCString();
}

const CATEGORY_BY_LOWER = new Map(
  CATEGORIES.map((name) => [name.toLowerCase(), name])
);

/** The scored category enum, canonical casing. Anything else is dropped. */
function scoredCategory(value: string | null): string | null {
  if (!value) return null;
  return CATEGORY_BY_LOWER.get(value.trim().toLowerCase()) ?? null;
}

/**
 * Rendered-locale title. A Vietnamese story without a stored translation falls
 * back to the real English title — the same fallback the site renders — and
 * aidr never synthesizes Vietnamese prose here.
 */
export function renderedTitle(item: FeedItem, lang: Lang): string {
  if (lang === "vi") return item.title_vi?.trim() || item.title;
  return item.title;
}

/** Rendered-locale summary, with the same honest cross-language fallback. */
export function renderedSummary(item: FeedItem, lang: Lang): string | null {
  const primary = lang === "vi" ? item.summary_vi : item.summary;
  const other = lang === "vi" ? item.summary : item.summary_vi;
  return primary?.trim() || other?.trim() || null;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * The canonical, indexable permalink for one item in one language: explicit
 * `lang`, no UTM, no fragment, no legacy `/{category}/{slug}` shape.
 */
export function feedItemPermalink(item: FeedItem, lang: Lang): string {
  return `${SITE_URL}${storyPath(item, lang)}`;
}

/**
 * The only upstream URL shape this feed will emit: the already-bounded
 * `image_url` from the feed query, re-validated through the media policy
 * (`canonicalizeMediaImageUrl` rejects non-http(s), credentialed,
 * non-default-port, and private-literal hosts) *and* the fetch boundary
 * (`isFetchableUrl` additionally rejects clear-text URLs outside the small
 * set of public source hosts). An unvetted publisher URL is never emitted.
 */
export function validatedItemMedia(item: FeedItem): string | null {
  if (!item.image_url) return null;
  if (item.image_url.length > MAX_PUBLIC_MEDIA_URL_LENGTH) return null;
  const canonical = canonicalizeMediaImageUrl(item.image_url);
  if (!canonical || !isFetchableUrl(canonical)) return null;
  return canonical;
}

/** Image extensions we can name truthfully; anything else omits `type`. */
const MEDIA_CONTENT_TYPES: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function mediaContentXml(url: string): string {
  const extension = /\.([a-z0-9]+)$/i.exec(url)?.[1]?.toLowerCase() ?? "";
  const type = MEDIA_CONTENT_TYPES[extension];
  const attrs = type
    ? `url="${escapeXml(url)}" type="${type}" medium="image"`
    : `url="${escapeXml(url)}" medium="image"`;
  return `    <media:content ${attrs} />`;
}

function rssItemXml(item: FeedItem, lang: Lang): string {
  const permalink = feedItemPermalink(item, lang);
  const parts: string[] = [
    "  <item>",
    `    <title>${escapeXml(clip(renderedTitle(item, lang), RSS_TITLE_MAX))}</title>`,
    `    <link>${escapeXml(permalink)}</link>`,
    `    <guid isPermaLink="true">${escapeXml(permalink)}</guid>`,
  ];
  const pubDate = rfc822Date(item.published_at);
  if (pubDate) parts.push(`    <pubDate>${pubDate}</pubDate>`);
  const summary = renderedSummary(item, lang);
  parts.push(
    `    <description>${escapeXml(
      summary ? clip(summary, RSS_DESCRIPTION_MAX) : SITE_DESCRIPTION
    )}</description>`
  );
  const categories = [
    scoredCategory(item.category),
    ...(Array.isArray(item.tags) ? item.tags : []).map((tag) =>
      typeof tag === "string" ? normalizeTopicName(tag) : ""
    ),
  ].filter((value): value is string => Boolean(value));
  const seen = new Set<string>();
  for (const category of categories) {
    if (seen.has(category.toLowerCase())) continue;
    seen.add(category.toLowerCase());
    parts.push(`    <category>${escapeXml(category)}</category>`);
    if (seen.size >= RSS_CATEGORY_LIMIT) break;
  }
  const media = validatedItemMedia(item);
  if (media) parts.push(mediaContentXml(media));
  parts.push("  </item>");
  return `${parts.join("\n")}\n`;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** `getFeed` returns days newest-first, so flattening preserves the order. */
export function feedItemsNewestFirst(feed: FeedResponse): FeedItem[] {
  return feed.days.flatMap((day) => day.items);
}

function channelMetadataXml(lang: Lang): string {
  // `rel="self"` always points at the canonical `/feed.xml` path, so the two
  // served paths cannot register as two different feeds in a reader. It
  // carries the resolved language: a bare request still advertises which
  // locale variant it actually received.
  const self = `${SITE_URL}${RSS_FEED_PATH}?lang=${lang}`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rss version="2.0" xmlns:atom="${ATOM_NAMESPACE}" xmlns:media="${MEDIA_NAMESPACE}">`,
    "<channel>",
    `    <title>${escapeXml(lang === "vi" ? SITE_NAME : SITE_TITLE)}</title>`,
    `    <link>${escapeXml(`${SITE_URL}/?lang=${lang}`)}</link>`,
    `    <description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    `    <language>${lang}</language>`,
    `    <atom:link rel="self" type="${RSS_CONTENT_TYPE}" href="${escapeXml(self)}" />`,
  ].join("\n");
}

/**
 * Bounded RSS 2.0 document. Items are added newest-first while the assembled
 * body stays under `RSS_MAX_BYTES`, so the byte cap holds for any input
 * shape — including a hostile or corrupt row set.
 */
export function buildRssXml(feed: FeedResponse, lang: Lang): string {
  const head = `${channelMetadataXml(lang)}\n`;
  const tail = "</channel>\n</rss>\n";
  const budget = RSS_MAX_BYTES - utf8Bytes(head) - utf8Bytes(tail);
  let body = "";
  let used = 0;
  for (const item of feedItemsNewestFirst(feed).slice(0, RSS_ITEM_LIMIT)) {
    const xml = rssItemXml(item, lang);
    const size = utf8Bytes(xml);
    if (used + size > budget) break;
    body += xml;
    used += size;
  }
  // `updatedAt` is the loader's read time; fall back to now when a caller
  // passes a payload without it.
  const lastBuildDate = rfc822Date(feed.updatedAt) || rfc822Date(Date.now());
  const stamp = lastBuildDate
    ? `    <lastBuildDate>${lastBuildDate}</lastBuildDate>\n`
    : "";
  // Splice the build stamp in after <channel> metadata so it never counts
  // against the item budget (it is a fixed ~50 bytes either way).
  return `${head}${stamp}${body}${tail}`;
}

/**
 * `/feed.xml` and `/rss.xml` are the same document with the same locale and
 * cache contract as `/api/feed`: one shared gate, one shared loader, one
 * shared bound. Bare requests are cookie/Accept-Language selected and private;
 * an explicit `lang` is publicly cacheable; `locale` gets one 307; anything
 * invalid, repeated, or conflicting gets the same 400 JSON.
 */
export async function handleFeedXmlRequest(
  request: Request,
  db: D1Database | undefined
): Promise<Response> {
  const locale = resolveApiRequestLocale(request);
  if (!locale.ok) return locale.response;
  const lang = locale.locale.lang;
  if (!db) {
    return apiErrorResponse(503, {
      error: "database_unavailable",
      message: "The RSS feed database is unavailable.",
      message_vi: "Cơ sở dữ liệu bản tin RSS không khả dụng.",
    });
  }
  const url = new URL(request.url);
  const { days, before } = feedDaysAndBefore(url.searchParams);
  try {
    const feed = await getFeed(readSession(db), { days, before });
    const policy = localeCacheControl(url.search, RSS_CACHE_CONTROL);
    return new Response(buildRssXml(feed, lang), {
      status: 200,
      headers: {
        "content-type": RSS_CONTENT_TYPE,
        "cache-control": policy.cacheControl,
        // A single-language document declares one language. (The error and
        // redirect paths above keep the bilingual `API_CONTENT_LANGUAGE`.)
        "content-language": lang,
        ...(policy.vary ? { Vary: policy.vary } : {}),
        // The feed advertises explicit-`lang` story permalinks, which are the
        // indexable form today; say so instead of inheriting a route policy
        // that classifies an unknown path as not-found.
        "x-robots-tag": "index, follow",
      },
    });
  } catch (error) {
    console.error("feed.xml failed:", error);
    return apiErrorResponse(500, {
      error: "query_failed",
      message: "The RSS feed query failed.",
      message_vi: "Không thể truy vấn bản tin RSS.",
    });
  }
}
