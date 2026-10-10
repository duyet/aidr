import { createFileRoute } from "@tanstack/react-router";
import { readSession } from "../../lib/db";
import { storyPath } from "../../lib/slug";
import { parseWeek, weekCacheControl } from "../../lib/week";
import { getWeekEdition, weekApiBody } from "../../lib/week-queries";

// type alias (not interface): TanStack routeTree.gen must re-export handler
// shapes; a non-exported interface triggers TS4023.
type HandlerArgs = { request: Request; params: { week: string } };

function json(body: unknown, status: number, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * `GET /api/week/<YYYY-Www>`: one weekly edition with both languages in
 * separate fields (language-neutral, so no `?lang=`). `text_vi` / `intro_vi`
 * are null or empty when Vietnamese is not ready, never English. Read by
 * the weekly video (`videos/daily-news/scripts/fetch-week.mjs`).
 */
export const Route = createFileRoute("/api/week/$week")({
  server: {
    handlers: {
      GET: async ({ params }: HandlerArgs) => {
        const nowMs = Date.now();
        const week = parseWeek(params.week, nowMs);
        if (!week) {
          return json({ error: "week_not_found" }, 404, "private, no-store");
        }
        let db: D1Database | undefined;
        try {
          db = ((await import("cloudflare:workers")).env as { DB?: D1Database })
            .DB;
        } catch {
          // not running in a workers runtime
        }
        if (!db) {
          return json({ error: "unavailable" }, 503, "private, no-store");
        }
        try {
          const edition = await getWeekEdition(readSession(db), week);
          if (!edition) {
            return json({ error: "week_not_found" }, 404, "private, no-store");
          }
          return json(
            weekApiBody(edition, (item) => storyPath(item)),
            200,
            weekCacheControl(week, nowMs)
          );
        } catch (error) {
          console.error("week api failed", error);
          return json({ error: "week_failed" }, 500, "private, no-store");
        }
      },
    },
  },
});
