import type { FeedResponse } from "../../lib/types";

/** The story `step` places away from `id` in the day that holds it, in the
 * feed's own order, or null at either end or when the feed lacks the story. */
export function neighborId(
  feed: Pick<FeedResponse, "days"> | null,
  id: string,
  step: 1 | -1
): string | null {
  const day = feed?.days.find((d) => d.items.some((item) => item.id === id));
  if (!day) return null;
  const at = day.items.findIndex((item) => item.id === id);
  return day.items[at + step]?.id ?? null;
}
