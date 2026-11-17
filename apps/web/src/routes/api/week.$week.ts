import { createFileRoute } from "@tanstack/react-router";
import { storyPath } from "../../lib/slug";
import { weekCacheControl } from "../../lib/week";
import { loadWeekEdition } from "../../lib/week-open";
import { weekApiBody } from "../../lib/week-queries";

// type alias (not interface): TanStack routeTree.gen must re-export handler
// shapes; a non-exported interface triggers TS4023.
type HandlerArgs = { request: Request; params: { week: string } };

const OPEN_WEEK_CACHE =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

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
          const load = await loadWeekEdition(db, params.week, nowMs);
          if (!load) {
            return json({ error: "week_not_found" }, 404, "private, no-store");
          }
          const { edition } = load;
          return json(
            weekApiBody(edition, (item) => storyPath(item)),
            200,
            edition.provisional
              ? OPEN_WEEK_CACHE
              : weekCacheControl(edition.week, nowMs)
          );
        } catch (error) {
          console.error("week api failed", error);
          return json({ error: "week_failed" }, 500, "private, no-store");
        }
      },
    },
  },
});
