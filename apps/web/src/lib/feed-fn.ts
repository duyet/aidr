import { createServerFn } from "@tanstack/react-start";
import { readSession } from "./db";
import { getFeed } from "./feed-queries";
import { shapeHomepageFeed } from "./homepage-feed";
import { markStage } from "./request-timing";
import type { FeedItem, FeedResponse, Lang } from "./types";

/** Server fn wrapping getFeed so the homepage loader can SSR stories. A
 * search page gets every match; the plain homepage gets its first view only
 * (see shapeHomepageFeed). Rows arrive collapsed (`detail: false`): the
 * SSR payload keeps every collapsed-row field (headline, title_vi, tags,
 * meta — all the SEO-relevant markup) but not summary, summary_vi or
 * sources, which never leave D1. StoryRow lazily refetches the full story
 * from /api/story on first expand via the `lazyDetail` flag. /api/feed
 * keeps the complete shape — it's an external contract. */
export const fetchFeed = createServerFn({ method: "GET" })
  .inputValidator((input: { q?: string; days?: number; lang?: Lang }) => input)
  .handler(async ({ data }): Promise<FeedResponse | null> => {
    markStage("auth");
    const { env } = await import("cloudflare:workers");
    const db = (env as { DB?: D1Database }).DB;
    if (!db) return null;
    try {
      const feed = await getFeed(readSession(db), {
        q: data.q,
        days: data.days,
        readOrder: true,
        detail: false,
      });
      if (!feed) return null;
      return data.q ? feed : shapeHomepageFeed(feed);
    } catch {
      return null;
    }
  });

/** One collapsed-row item: expand-only fields dropped, `lazyDetail` set.
 * The day archive and week pages collapse full rows this way; `getFeed`
 * with `detail: false` produces the same item from SQL. */
export function stripItemDetail(item: FeedItem): FeedItem {
  return {
    ...item,
    summary: null,
    summary_vi: null,
    sources: [],
    lazyDetail: Boolean(
      item.summary || item.summary_vi || item.sources.length > 0
    ),
  };
}
