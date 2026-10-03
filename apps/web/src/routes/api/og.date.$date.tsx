import { cache, ImageResponse } from "@cf-wasm/og/workerd";
import { createFileRoute } from "@tanstack/react-router";
import {
  dayArchiveCacheControl,
  isSettledArchiveDate,
  parseArchiveDate,
} from "../../lib/day-archive";
import {
  DAY_OG_HEIGHT,
  DAY_OG_MAX_TILES,
  DAY_OG_WIDTH,
  dayOgCard,
  dayOgTile,
  dayOgTileCount,
  hasDayOgCopy,
} from "../../lib/day-og";
import { readSession } from "../../lib/db";
import { getDayArchive } from "../../lib/feed-queries";
import { cachedOgResponse } from "../../lib/og-cache";
import { loadOgFontAsset, loadStoryOgFonts } from "../../lib/og-fonts";
import {
  fetchStoryOgImage,
  type StoryOgImage,
  storyOgImageFromBytes,
  storyOgLanguage,
} from "../../lib/story-og";

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
const DAY_OG_CANDIDATES = 18;

/** A Worker keeps at most 6 outbound connections open; a larger burst
 *  queues, and the queued fetches spend their timeout waiting. */
const FETCH_BATCH = 6;

/** Source photos are kept this long in R2 so EN and VI renders, and later
 *  hourly re-renders, reuse them instead of re-fetching from the publisher
 *  (some CDNs throttle repeat fetches). */
const SOURCE_PHOTO_MAX_AGE_MS = 7 * 86_400_000;

async function sourcePhotoKey(url: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url)
  );
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `src/${hex}`;
}

async function fetchTilePhoto(
  url: string,
  bucket: R2Bucket | undefined
): Promise<StoryOgImage | null> {
  const key = bucket ? await sourcePhotoKey(url) : "";
  if (bucket) {
    const obj = await bucket.get(key).catch(() => null);
    const at = Number(obj?.customMetadata?.fetchedAt ?? 0);
    if (obj && Date.now() - at < SOURCE_PHOTO_MAX_AGE_MS) {
      return storyOgImageFromBytes(new Uint8Array(await obj.arrayBuffer()));
    }
  }
  // The render is cached, so a slow publisher CDN is worth the wait.
  const image = await fetchStoryOgImage(url, { timeoutMs: 5000 });
  if (image && bucket) {
    const bytes = Uint8Array.from(
      atob(image.dataUri.slice(image.dataUri.indexOf(",") + 1)),
      (c) => c.charCodeAt(0)
    );
    await bucket
      .put(key, bytes, {
        httpMetadata: { contentType: image.mimeType },
        customMetadata: { fetchedAt: String(Date.now()) },
      })
      .catch(() => undefined);
  }
  return image;
}

/** Photos in rank order, fetched 6 at a time until the grid is full. */
async function fetchTilePhotos(
  urls: Array<string | null>,
  bucket: R2Bucket | undefined
): Promise<Array<StoryOgImage | null>> {
  const out: Array<StoryOgImage | null> = urls.map(() => null);
  let found = 0;
  for (
    let i = 0;
    i < urls.length && found < DAY_OG_MAX_TILES;
    i += FETCH_BATCH
  ) {
    const batch = urls.slice(i, i + FETCH_BATCH);
    const images = await Promise.all(
      batch.map((url) =>
        url && !isHeadlineCardImage(url) ? fetchTilePhoto(url, bucket) : null
      )
    );
    images.forEach((image, j) => {
      out[i + j] = image;
      if (image) found++;
    });
  }
  return out;
}

/** Aggregator share images that are just the headline set in type; on the
 * card they repeat the tile title in English. */
const HEADLINE_CARD_HOSTS = new Set(["huggingnews.com", "marketbrief.now"]);

function isHeadlineCardImage(url: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      HEADLINE_CARD_HOSTS.has(u.hostname.replace(/^www\./, "")) &&
      u.pathname.startsWith("/og/")
    );
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

        return cachedOgResponse(
          request,
          ctx,
          async () => {
            const archive = await getDayArchive(readSession(db), date);
            const lang = storyOgLanguage(
              new URL(request.url).searchParams.get("lang")
            );
            const all = (archive.day?.items ?? []).filter((item) =>
              hasDayOgCopy(item, lang)
            );
            if (all.length === 0) {
              return Response.json({ error: "not found" }, { status: 404 });
            }
            // Fetch photos for the top dozen so a dead, hotlink-blocked or WebP
            // thumbnail does not cost the grid a photo a lower story has.
            const candidates = all.slice(0, DAY_OG_CANDIDATES);
            const [fonts, fetched] = await Promise.all([
              loadStoryOgFonts((path) => loadOgFontAsset(env, path)),
              fetchTilePhotos(
                candidates.map((item) => item.image_url),
                env?.OG_CACHE
              ),
            ]);
            const scored = candidates.map((item, i) => ({
              item,
              image: fetched[i] ?? null,
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
          },
          {
            bucket: env?.OG_CACHE,
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
