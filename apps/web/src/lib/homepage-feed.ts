import { withLang } from "./locale-url";
import type { DayGroup, FeedResponse, Lang } from "./types";

type TldrItem = NonNullable<FeedResponse["tldrItems"]>[number];

/** Digest-linked stories missing from `days`, slimmed to the fields the
 * AI;DR rows read, picked from `pool`. */
function cutTldrItems(
  tldr: FeedResponse["tldr"],
  days: DayGroup[],
  pool: TldrItem[]
): TldrItem[] {
  const shown = new Set(days.flatMap((d) => d.items.map((item) => item.id)));
  const linked = new Set(
    [...(tldr?.bullets_en ?? []), ...(tldr?.bullets_vi ?? [])]
      .flatMap((bullet) => bullet.item_ids ?? [])
      .filter((id) => !shown.has(id))
  );
  const out = new Map<string, TldrItem>();
  for (const { id, category, tags, image_url } of pool) {
    if (linked.has(id) && !out.has(id)) {
      out.set(id, { id, category, tags, image_url });
    }
  }
  return [...out.values()];
}

/** Stories a day section renders before its "Load more" button. */
export const DAY_STORY_LIMIT = 30;

/**
 * Trim the homepage SSR payload to its first view: the newest day that has
 * stories (today, or yesterday before today's first edition) and its first
 * `limit` stories. Older days and the rest of the day load on demand, so the
 * HTML and the dehydrated loader state stay small.
 *
 * The digest may link stories that were cut. Their topic fields ride along
 * in `tldrItems` so the AI;DR rows render the same as before.
 */
export function shapeHomepageFeed(
  feed: FeedResponse,
  limit = DAY_STORY_LIMIT
): FeedResponse {
  const first = feed.days[0];
  if (!first) return feed;

  const items = first.items.slice(0, limit);
  const day: DayGroup = {
    ...first,
    items,
    ...(first.items.length > items.length
      ? { totalItems: first.items.length }
      : {}),
  };

  const tldrItems = cutTldrItems(
    feed.tldr,
    [day],
    feed.days.flatMap((d) => d.items)
  );
  return {
    ...feed,
    days: [day],
    hasMore: feed.hasMore || feed.days.length > 1,
    ...(tldrItems.length > 0 ? { tldrItems } : {}),
  };
}

/**
 * Fold a refreshed /api/feed response into what the page already shows:
 * update days on screen, add newer days, and leave out older days the reader
 * has not asked for yet.
 */
export function mergeRefreshedFeed(
  prev: FeedResponse,
  next: FeedResponse
): FeedResponse {
  const oldest = prev.days[prev.days.length - 1]?.date;
  const fresh = next.days.filter((d) => !oldest || d.date >= oldest);
  const freshDates = new Set(fresh.map((d) => d.date));
  const kept = prev.days.filter((d) => !freshDates.has(d.date));
  const days = [...fresh, ...kept].sort((a, b) => b.date.localeCompare(a.date));
  // /api/feed has no tldrItems: rebuild them from the refreshed window so
  // digest rows keep their topic fields after a refresh.
  const tldrItems = cutTldrItems(next.tldr, days, [
    ...next.days.flatMap((d) => d.items),
    ...(prev.tldrItems ?? []),
  ]);
  return {
    ...next,
    days,
    hasMore: prev.hasMore || next.hasMore || fresh.length < next.days.length,
    tldrItems: tldrItems.length > 0 ? tldrItems : undefined,
  };
}

/** `/api/feed` params that return exactly one audience-zone day. */
export function dayFeedParams(date: string): Record<string, string> {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { days: "1", before: next };
}

/** `/api/feed` as the homepage asks for it. `order=reads` returns the in-day
 * order the SSR loader renders, so a refresh, "Load more" or an older page
 * keeps it. Every other caller gets stored rank_score order. */
export function homepageFeedUrl(
  params: Record<string, string>,
  lang: Lang
): string {
  const search = new URLSearchParams({ ...params, order: "reads" });
  return withLang(`/api/feed?${search}`, lang);
}

export function wantsReadOrder(search: URLSearchParams): boolean {
  return search.get("order") === "reads";
}
