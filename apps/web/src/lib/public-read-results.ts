/**
 * Shared result shaping for the public read tools.
 *
 * Split from `public-read-tools.ts` (the contract) because this half has
 * to know the feed/digest *shapes*, while the contract half must stay
 * importable in a browser bundle with no D1 code. Both MCP
 * (`worker/mcp/public-tools.ts`) and WebMCP (`src/lib/webmcp.ts`) import
 * this, so a search result cannot be shaped one way over MCP and another
 * way in the page.
 *
 * Every function here is pure. The single hard rule: a tool result may
 * never exceed `PUBLIC_RESPONSE_MAX_BYTES` — the same ceiling as
 * `GET /api/public`. A read tool is a delivery mechanism for text a
 * caller will paste into a model context window, so an unbounded result
 * is a denial-of-service against the *client*, not just against us.
 */

import { absoluteSiteUrl } from "./locale-url";
import { PUBLIC_RESPONSE_MAX_BYTES } from "./public-bounds";
// Type-only: `public-queries` carries the D1 query helpers, which must stay
// out of a browser bundle. `import type` is erased at build time.
import type { PublicDigest } from "./public-queries";
import type { PublicReadLang } from "./public-read-tools";
import { storyPath } from "./slug";
import { displayTldrBullets } from "./tldr-fallback";
import type { FeedItem, FeedResponse } from "./types";

/** The one ceiling. Re-exported so both transports reference one name. */
export const PUBLIC_READ_RESULT_MAX_BYTES = PUBLIC_RESPONSE_MAX_BYTES;

export function readResultBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function exceedsReadResultBound(text: string): boolean {
  return (
    new TextEncoder().encode(text).byteLength > PUBLIC_READ_RESULT_MAX_BYTES
  );
}

export interface PublicReadToolItem {
  id: string;
  url: string;
  title: string;
  title_vi: string | null;
  summary: string | null;
  summary_vi: string | null;
  category: string | null;
  tags: string[];
  published_at: number;
  rank_score: number;
  permalink: string;
}

export interface PublicReadToolDay {
  date: string;
  items: PublicReadToolItem[];
}

export interface PublicReadSearchResult {
  lang: PublicReadLang;
  available_langs: readonly ["en", "vi"];
  days: PublicReadToolDay[];
  categories: Array<{ name: string; count: number }>;
  trending: Array<{ tag: string; count: number }>;
  totalStories: number;
  hasMore: boolean;
  /** Set when the oldest tail had to be dropped to stay under the bound. */
  truncated: boolean;
}

/** Sources, media manifests, and thumbnails are deliberately dropped: they
 *  are the bulk of the feed payload and `get_story` returns them already
 *  sanitized. An agent that needs a citation URL gets it from `url` and
 *  `permalink`. */
function projectFeedItem(
  item: FeedItem,
  lang: PublicReadLang
): PublicReadToolItem {
  return {
    id: item.id,
    url: item.url,
    title: item.title,
    title_vi: item.title_vi ?? null,
    summary: item.summary ?? null,
    summary_vi: item.summary_vi ?? null,
    category: item.category ?? null,
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 12) : [],
    published_at: item.published_at,
    rank_score: item.rank_score,
    permalink: absoluteSiteUrl(storyPath(item), lang),
  };
}

export function projectSearchResult(
  feed: FeedResponse,
  lang: PublicReadLang
): PublicReadSearchResult {
  const days = (feed.days ?? []).map((day) => ({
    date: day.date,
    items: (day.items ?? []).map((item) => projectFeedItem(item, lang)),
  }));
  return {
    lang,
    available_langs: ["en", "vi"],
    days,
    categories: (feed.categories ?? []).map((category) => ({
      name: category.name,
      count: category.count,
    })),
    trending: (feed.trending ?? []).map((trend) => ({
      tag: trend.tag,
      count: trend.count,
    })),
    totalStories: feed.totalStories ?? 0,
    hasMore: Boolean(feed.hasMore),
    truncated: false,
  };
}

/**
 * Drop the oldest tail until the payload fits, mirroring the order in which
 * `boundPublicDigest` sheds fields: least useful first, oldest first. If
 * even an empty result is over the bound the caller fails closed with
 * `result_too_large` — a truncated list that silently loses the whole
 * window is worse than an explicit error.
 */
export function boundSearchResult(
  result: PublicReadSearchResult
): { ok: true; value: PublicReadSearchResult } | { ok: false; error: string } {
  const clone: PublicReadSearchResult = {
    ...result,
    categories: [...result.categories],
    trending: [...result.trending],
    days: result.days.map((day) => ({ date: day.date, items: [...day.items] })),
  };
  if (readResultBytes(clone) <= PUBLIC_READ_RESULT_MAX_BYTES) {
    return { ok: true, value: clone };
  }
  clone.truncated = true;
  for (let index = clone.days.length - 1; index >= 0; index--) {
    const day = clone.days[index];
    if (!day) continue;
    while (day.items.length > 0) {
      day.items.pop();
      if (readResultBytes(clone) <= PUBLIC_READ_RESULT_MAX_BYTES) {
        return { ok: true, value: clone };
      }
    }
    clone.days.pop();
  }
  for (const trend of clone.trending) {
    if (readResultBytes(clone) <= PUBLIC_READ_RESULT_MAX_BYTES) {
      return { ok: true, value: clone };
    }
    clone.trending = clone.trending.filter((entry) => entry !== trend);
  }
  clone.categories = [];
  if (readResultBytes(clone) <= PUBLIC_READ_RESULT_MAX_BYTES) {
    return { ok: true, value: clone };
  }
  return {
    ok: false,
    error:
      `search result exceeded the ${PUBLIC_READ_RESULT_MAX_BYTES}-byte public ` +
      "read bound; narrow the query with `q`, `category`, or a smaller `days`.",
  };
}

export interface PublicReadDigestBullets {
  lang: PublicReadLang;
  available_langs: readonly ["en", "vi"];
  /** Empty when no snapshot and fewer than two ranked stories exist. Never
   *  invented prose — the fallback is the real story title. */
  date: string;
  bullets: Array<{
    text: string;
    story_ids: string[];
    permalink: string | null;
  }>;
  story_count: number;
}

/**
 * TL;DR-only projection. Reuses `displayTldrBullets`, the same helper the
 * homepage uses, so an agent can never receive a Vietnamese digest the
 * product itself would refuse to paint (an English-only `bullets_vi` while
 * `title_vi` exists).
 */
export function projectDigestBullets(
  digest: PublicDigest,
  lang: PublicReadLang
): PublicReadDigestBullets {
  const bullets = displayTldrBullets(digest.tldr, lang);
  return {
    lang,
    available_langs: ["en", "vi"],
    date: digest.tldr?.date ?? "",
    bullets: bullets.map((bullet) => {
      const first = bullet.item_ids?.[0];
      return {
        text: bullet.text,
        story_ids: (bullet.item_ids ?? []).slice(0, 8),
        permalink: first
          ? absoluteSiteUrl(storyPath({ id: first }), lang)
          : null,
      };
    }),
    story_count: digest.stories?.length ?? 0,
  };
}
