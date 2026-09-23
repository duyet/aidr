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
      return await getFeed(readSession(db), {
        q: data.q,
        days: data.days,
      });
    } catch {
      return null;
    }
  });
