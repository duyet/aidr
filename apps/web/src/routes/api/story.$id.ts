import { createFileRoute } from "@tanstack/react-router";
import { readSession } from "../../lib/db";
import { resolveLang } from "../../lib/lang";
import { absoluteSiteUrl, localeCacheControl } from "../../lib/locale-url";
import { storyPath } from "../../lib/slug";
import { getStory } from "../../lib/story-queries";

const STORY_CACHE_CONTROL =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=3600";

export const Route = createFileRoute("/api/story/$id")({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
        context,
      }: {
        request: Request;
        params: { id: string };
        context: any;
      }) => {
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

        try {
          const url = new URL(request.url);
          const lang = resolveLang({
            search: url.search,
            cookie: request.headers.get("cookie"),
            acceptLanguage: request.headers.get("accept-language"),
          });
          const idPrefix = params.id.slice(0, 64);
          const item = await getStory(readSession(db), idPrefix);
          if (!item) {
            return Response.json({ error: "not found" }, { status: 404 });
          }
          const policy = localeCacheControl(url.search, STORY_CACHE_CONTROL);
          return Response.json(
            {
              ...item,
              lang,
              permalink: absoluteSiteUrl(storyPath(item), lang),
            },
            {
              headers: {
                "Cache-Control": policy.cacheControl,
                "Content-Language": lang,
                ...(policy.vary ? { Vary: policy.vary } : {}),
              },
            }
          );
        } catch (e) {
          console.error("story.$id:", e);
          return Response.json({ error: "query failed" }, { status: 500 });
        }
      },
    },
  },
});
