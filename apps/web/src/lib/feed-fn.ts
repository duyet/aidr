import { createServerFn } from "@tanstack/react-start";
import { readSession } from "./db";
import { getFeed } from "./feed-queries";
import type { FeedResponse } from "./types";

/** Server fn wrapping getFeed so the homepage loader can SSR stories. */
export const fetchFeed = createServerFn({ method: "GET" })
  .inputValidator((input: { q?: string; days?: number }) => input)
  .handler(async ({ data }): Promise<FeedResponse | null> => {
    const { env } = await import("cloudflare:workers");
    const db = (env as { DB?: D1Database }).DB;
    if (!db) return null;
    try {
      const feed = await getFeed(readSession(db), {
        q: data.q,
        days: data.days,
      });
      return feed ? stripExpandableDetail(feed) : null;
    } catch {
      return null;
    }
  });

/**
 * The SSR payload keeps every collapsed-row field (headline, title_vi,
 * tags, meta — all the SEO-relevant markup) but drops the expand-only
 * fields: summary, summary_vi and sources. StoryRow lazily refetches the
 * full story from /api/story on first expand via the `lazyDetail` flag.
 * /api/feed keeps the complete shape — it's an external contract.
 */
function stripExpandableDetail(feed: FeedResponse): FeedResponse {
  return {
    ...feed,
    days: feed.days.map((day) => ({
      ...day,
      items: day.items.map((item) => ({
        ...item,
        summary: null,
        summary_vi: null,
        sources: [],
        lazyDetail: Boolean(
          item.summary || item.summary_vi || item.sources.length > 0
        ),
      })),
    })),
  };
}
