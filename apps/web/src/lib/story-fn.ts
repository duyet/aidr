import { createServerFn } from "@tanstack/react-start";
import { readSession } from "./db";
import { getStory } from "./story-queries";
import type { FeedItem } from "./types";

/** Server fn wrapping getStory for the $slug permalink loader. Null when no
 * story matches; a failed read throws `story_unavailable`, which the route
 * renders as a 500. */
export const fetchStory = createServerFn({ method: "GET" })
  .inputValidator((input: { idPrefix: string }) => input)
  .handler(async ({ data }): Promise<FeedItem | null> => {
    const { env } = await import("cloudflare:workers");
    const db = (env as { DB?: D1Database }).DB;
    if (!db) return null;
    try {
      return await getStory(readSession(db), data.idPrefix);
    } catch (error) {
      console.error("story page failed", error);
      // Start serializes a loader error into the page; keep D1 text out.
      throw new Error("story_unavailable");
    }
  });
