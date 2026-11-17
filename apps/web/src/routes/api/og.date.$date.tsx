import { cache } from "@cf-wasm/og/workerd";
import { createFileRoute } from "@tanstack/react-router";
import { isSettledArchiveDate, parseArchiveDate } from "../../lib/day-archive";
import { renderDayCard } from "../../lib/day-og-render";
import { cachedOgResponse, dayOgObjectKey } from "../../lib/og-cache";
import { storyOgLanguage } from "../../lib/story-og";

export const Route = createFileRoute("/api/og/date/$date")({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
        context,
      }: {
        request: Request;
        params: { date: string };
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
        const ctx = context?.cloudflare?.ctx ?? context?.ctx;
        if (ctx?.waitUntil) cache.setExecutionContext(ctx);
        const db: D1Database | undefined = env?.DB;
        if (!db) {
          return Response.json(
            { error: "D1 binding DB not configured" },
            { status: 500 }
          );
        }
        const date = parseArchiveDate(
          params.date.replace(/\.png$/i, ""),
          Date.now()
        );
        if (!date)
          return Response.json({ error: "not found" }, { status: 404 });

        return cachedOgResponse(
          request,
          ctx,
          async () => {
            const lang = storyOgLanguage(
              new URL(request.url).searchParams.get("lang")
            );
            const rendered = await renderDayCard(env, date, lang, Date.now());
            return rendered.store
              ? { response: rendered.response, maxAgeSec: rendered.maxAgeSec }
              : { response: rendered.response, store: false as const };
          },
          {
            bucket: env?.OG_CACHE,
            key: dayOgObjectKey(new URL(request.url)),
            // A settled day never changes; a recent one re-renders hourly.
            maxAgeSec: isSettledArchiveDate(date, Date.now())
              ? 30 * 86_400
              : 3600,
          }
        );
      },
    },
  },
});
