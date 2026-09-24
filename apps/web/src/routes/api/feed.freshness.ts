import { createFileRoute } from "@tanstack/react-router";
import { readSession } from "../../lib/db";
import {
  feedFreshnessResponse,
  getFeedFreshness,
} from "../../lib/feed-freshness";
import { resolveWorkerEnv } from "../../lib/system-api";

export const Route = createFileRoute("/api/feed/freshness")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) => {
        const env = await resolveWorkerEnv(context);
        const db: D1Database | undefined = env?.DB;
        if (!db) {
          return Response.json(
            { error: "D1 binding DB not configured" },
            { status: 500 }
          );
        }

        try {
          const freshness = await getFeedFreshness(readSession(db));
          return feedFreshnessResponse(freshness);
        } catch (e) {
          console.error("feed freshness:", e);
          return Response.json({ error: "query failed" }, { status: 500 });
        }
      },
    },
  },
});
