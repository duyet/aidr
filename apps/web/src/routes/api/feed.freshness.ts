import { createFileRoute } from "@tanstack/react-router";
import { readPrimarySession } from "../../lib/db";
import {
  FEED_FRESHNESS_ERROR_CACHE_CONTROL,
  feedFreshnessResponse,
  getFeedFreshness,
} from "../../lib/feed-freshness";
import { resolveWorkerEnv } from "../../lib/system-api";

type FeedFreshnessHandlerArgs = { context: any };

function freshnessError(message: string): Response {
  return Response.json(
    { error: message },
    {
      status: 500,
      headers: { "Cache-Control": FEED_FRESHNESS_ERROR_CACHE_CONTROL },
    }
  );
}

export async function feedFreshnessHandler({
  context,
}: FeedFreshnessHandlerArgs): Promise<Response> {
  try {
    const env = await resolveWorkerEnv(context);
    const db: D1Database | undefined = env?.DB;
    if (!db) return freshnessError("D1 binding DB not configured");

    const freshness = await getFeedFreshness(readPrimarySession(db));
    return feedFreshnessResponse(freshness);
  } catch (e) {
    console.error("feed freshness:", e);
    return freshnessError("query failed");
  }
}

export const Route = createFileRoute("/api/feed/freshness")({
  server: {
    handlers: {
      GET: feedFreshnessHandler,
    },
  },
});
