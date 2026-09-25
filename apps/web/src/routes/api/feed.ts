import { createFileRoute } from "@tanstack/react-router";
import { readSession } from "../../lib/db";
import { getFeed } from "../../lib/feed-queries";
import {
  API_CONTENT_LANGUAGE,
  apiErrorResponse,
  resolveApiRequestLocale,
} from "../../lib/locale-response";
import { localeCacheControl } from "../../lib/locale-url";

const FEED_CACHE_CONTROL =
  "public, max-age=60, s-maxage=120, stale-while-revalidate=300";

export const Route = createFileRoute("/api/feed")({
  server: {
    handlers: {
      GET: async ({ request, context }: { request: Request; context: any }) => {
        const locale = resolveApiRequestLocale(request);
        if (!locale.ok) return locale.response;
        const lang = locale.locale.lang;

        let env =
          context?.cloudflare?.env ||
          context?.env ||
          (globalThis as any).CF_ENV;
        if (!env?.DB) {
          try {
            env = (await import("cloudflare:workers")).env;
          } catch {
            // not running in a workers runtime
          }
        }
        const db: D1Database | undefined = env?.DB;
        if (!db) {
          return apiErrorResponse(500, {
            error: "database_unavailable",
            message: "The feed database is unavailable.",
            message_vi: "Cơ sở dữ liệu bản tin không khả dụng.",
          });
        }

        const url = new URL(request.url);
        const daysRaw = url.searchParams.get("days");
        const days = daysRaw ? Number.parseInt(daysRaw, 10) : undefined;
        const before = url.searchParams.get("before") ?? undefined;
        try {
          const feed = await getFeed(readSession(db), {
            category: url.searchParams.get("category") ?? undefined,
            q: url.searchParams.get("q") ?? undefined,
            days:
              days !== undefined && Number.isFinite(days) && days > 0
                ? Math.min(days, 14)
                : undefined,
            before:
              before && /^\d{4}-\d{2}-\d{2}$/.test(before) ? before : undefined,
          });
          const policy = localeCacheControl(url.search, FEED_CACHE_CONTROL);
          return Response.json(
            { ...feed, lang, available_langs: ["en", "vi"] },
            {
              headers: {
                "Cache-Control": policy.cacheControl,
                "Content-Language": API_CONTENT_LANGUAGE,
                ...(policy.vary ? { Vary: policy.vary } : {}),
              },
            }
          );
        } catch (e) {
          console.error("feed:", e);
          return apiErrorResponse(500, {
            error: "query_failed",
            message: "The feed query failed.",
            message_vi: "Không thể truy vấn bản tin.",
          });
        }
      },
    },
  },
});
