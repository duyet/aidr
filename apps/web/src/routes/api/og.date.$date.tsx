import { cache, ImageResponse } from "@cf-wasm/og/workerd";
import { createFileRoute } from "@tanstack/react-router";
import {
  dayArchiveCacheControl,
  isSettledArchiveDate,
  parseArchiveDate,
} from "../../lib/day-archive";
import {
  DAY_OG_HEIGHT,
  DAY_OG_WIDTH,
  dayOgCard,
  dayOgTile,
  dayOgTileCount,
} from "../../lib/day-og";
import { readSession } from "../../lib/db";
import { getDayArchive } from "../../lib/feed-queries";
import { cachedOgResponse } from "../../lib/og-cache";
import { loadOgFontAsset, loadStoryOgFonts } from "../../lib/og-fonts";
import { fetchStoryOgImage, storyOgLanguage } from "../../lib/story-og";

/** Day card: `/api/og/date/YYYY-MM-DD.png?lang=en|vi`. */
/** Settled days follow the page; a recent day's card refreshes hourly (the
 * pipeline's own cadence) instead of the page's 5 minutes, since each render
 * fetches six remote images. */
function dayOgCacheControl(date: string): string {
  return isSettledArchiveDate(date, Date.now())
    ? dayArchiveCacheControl(date, Date.now())
    : "public, max-age=600, s-maxage=3600, stale-while-revalidate=3600";
}

/** Stories whose photos are fetched to fill the grid. */
const DAY_OG_CANDIDATES = 12;

/** Aggregator share images that are just the headline set in type; on the
 * card they repeat the tile title in English. */
function isHeadlineCardImage(url: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === "huggingnews.com" && u.pathname.startsWith("/og/");
  } catch {
    return false;
  }
}

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

        return cachedOgResponse(request, ctx, async () => {
          const archive = await getDayArchive(readSession(db), date);
          const all = archive.day?.items ?? [];
          if (all.length === 0) {
            return Response.json({ error: "not found" }, { status: 404 });
          }
          const lang = storyOgLanguage(
            new URL(request.url).searchParams.get("lang")
          );
          // Fetch photos for the top dozen so a dead, hotlink-blocked or WebP
          // thumbnail does not cost the grid a photo a lower story has.
          const candidates = all.slice(0, DAY_OG_CANDIDATES);
          const [fonts, fetched] = await Promise.all([
            loadStoryOgFonts((path) => loadOgFontAsset(env, path)),
            Promise.all(
              candidates.map((item) =>
                isHeadlineCardImage(item.image_url)
                  ? null
                  : fetchStoryOgImage(item.image_url)
              )
            ),
          ]);
          const scored = candidates.map((item, i) => ({
            item,
            image: fetched[i],
          }));
          // Real photos first, in rank order; text tiles fill the rest.
          const picked = [
            ...scored.filter((c) => c.image),
            ...scored.filter((c) => !c.image),
          ].slice(0, dayOgTileCount(scored.length));
          const items = picked.map((p) => p.item);
          const images = picked.map((p) => p.image);
          const tiles = items.map((item, i) =>
            dayOgTile(item, images[i], lang)
          );
          return await ImageResponse.async(dayOgCard(date, tiles, lang), {
            width: DAY_OG_WIDTH,
            height: DAY_OG_HEIGHT,
            ...(fonts.length ? { fonts } : {}),
            headers: {
              "Cache-Control": dayOgCacheControl(date),
              "Content-Language": lang,
            },
          });
        });
      },
    },
  },
});
