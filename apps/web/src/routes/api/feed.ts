import { createFileRoute } from "@tanstack/react-router";
import { readSession } from "../../lib/db";
import { getFeed } from "../../lib/feed-queries";
import { resolveLang } from "../../lib/lang";
import { localeCacheControl } from "../../lib/locale-url";

const FEED_CACHE_CONTROL =
  "public, max-age=60, s-maxage=120, stale-while-revalidate=300";

export const Route = createFileRoute("/api/feed")({
  server: {
    handlers: {
      GET: async ({ request, context }: { request: Request; context: any }) => {
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
          return Response.json(
            { error: "D1 binding DB not configured" },
            { status: 500 }
          );
        }

        const url = new URL(request.url);
        const lang = resolveLang({
          search: url.search,
          cookie: request.headers.get("cookie"),
          acceptLanguage: request.headers.get("accept-language"),
        });
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
            { ...feed, lang },
            {
              headers: {
                "Cache-Control": policy.cacheControl,
                "Content-Language": lang,
                ...(policy.vary ? { Vary: policy.vary } : {}),
              },
            }
          );
        } catch (e) {
          console.error("feed:", e);
          return Response.json({ error: "query failed" }, { status: 500 });
        }
      },
    },
  },
});
