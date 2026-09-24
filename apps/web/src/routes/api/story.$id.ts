import { createFileRoute } from "@tanstack/react-router";
import { readSession } from "../../lib/db";
import {
  API_CONTENT_LANGUAGE,
  apiErrorResponse,
  resolveApiRequestLocale,
} from "../../lib/locale-response";
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
        const locale = resolveApiRequestLocale(request);
        if (!locale.ok) return locale.response;
        const lang = locale.locale.lang;
        const url = new URL(request.url);

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
            message: "The story database is unavailable.",
            message_vi: "Cơ sở dữ liệu bài viết không khả dụng.",
          });
        }

        try {
          const idPrefix = params.id.slice(0, 64);
          const item = await getStory(readSession(db), idPrefix);
          if (!item) {
            return apiErrorResponse(404, {
              error: "not_found",
              message: "Story not found.",
              message_vi: "Không tìm thấy bài viết.",
            });
          }
          const policy = localeCacheControl(url.search, STORY_CACHE_CONTROL);
          return Response.json(
            {
              ...item,
              lang,
              available_langs: ["en", "vi"],
              permalink: absoluteSiteUrl(storyPath(item), lang),
            },
            {
              headers: {
                "Cache-Control": policy.cacheControl,
                "Content-Language": API_CONTENT_LANGUAGE,
                ...(policy.vary ? { Vary: policy.vary } : {}),
              },
            }
          );
        } catch (e) {
          console.error("story.$id:", e);
          return apiErrorResponse(500, {
            error: "query_failed",
            message: "The story query failed.",
            message_vi: "Không thể truy vấn bài viết.",
          });
        }
      },
    },
  },
});
