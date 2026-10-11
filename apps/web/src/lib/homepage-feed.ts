import type { DayGroup, FeedResponse } from "./types";

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

  const kept = new Set(items.map((item) => item.id));
  const linked = new Set(
    [...(feed.tldr?.bullets_en ?? []), ...(feed.tldr?.bullets_vi ?? [])]
      .flatMap((bullet) => bullet.item_ids ?? [])
      .filter((id) => !kept.has(id))
  );
  const tldrItems = feed.days
    .flatMap((d) => d.items)
    .filter((item) => linked.has(item.id))
    .map(({ id, category, tags, image_url }) => ({
      id,
      category,
      tags,
      image_url,
    }));

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
  return {
    ...next,
    days: [...fresh, ...kept].sort((a, b) => b.date.localeCompare(a.date)),
    hasMore: prev.hasMore || next.hasMore || fresh.length < next.days.length,
  };
}

/** `/api/feed` query that returns exactly one audience-zone day. */
export function dayFeedQuery(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return `?days=1&before=${next}`;
}
