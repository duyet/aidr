import { cache, ImageResponse } from "@cf-wasm/og/workerd";
import { createFileRoute } from "@tanstack/react-router";
import {
  dayArchiveCacheControl,
  isSettledArchiveDate,
  latestArchiveDate,
  parseArchiveDate,
} from "../../lib/day-archive";
import {
  DAY_OG_HEIGHT,
  DAY_OG_WIDTH,
  dayCardModel,
  dayOgCard,
} from "../../lib/day-og";
import { readSession } from "../../lib/db";
import { getDayArchive } from "../../lib/feed-queries";
import { cachedOgResponse, dayOgObjectKey } from "../../lib/og-cache";
import { loadOgFontAsset, loadStoryOgFonts } from "../../lib/og-fonts";
import {
  fetchStoryOgImage,
  imagesBindingTranscoder,
  isCardSizedPhoto,
  type StoryOgImage,
  storyOgImageFromBytes,
  storyOgLanguage,
} from "../../lib/story-og";

/** Settled days follow the page; a recent day's card refreshes hourly (the
 * pipeline's own cadence) instead of the page's 5 minutes, since each render
 * fetches up to six remote images. */
function dayOgCacheControl(date: string): string {
  return isSettledArchiveDate(date, Date.now())
    ? dayArchiveCacheControl(date, Date.now())
    : "public, max-age=600, s-maxage=3600, stale-while-revalidate=3600";
}

/** A recent day with no story yet: its first stories should show within
 *  minutes, so the card is neither stored nor cached for long. */
const EMPTY_RECENT_CACHE_CONTROL = "public, max-age=300";

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
  bucket: R2Bucket | undefined,
  images: ImagesBinding | undefined
): Promise<StoryOgImage | null> {
  const key = bucket ? await sourcePhotoKey(url) : "";
  if (bucket) {
    const obj = await bucket.get(key).catch(() => null);
    const at = Number(obj?.customMetadata?.fetchedAt ?? 0);
    if (obj && Date.now() - at < SOURCE_PHOTO_MAX_AGE_MS) {
      const cached = storyOgImageFromBytes(
        new Uint8Array(await obj.arrayBuffer())
      );
      return cached && isCardSizedPhoto(cached) ? cached : null;
    }
  }
  // The render is cached, so a slow publisher CDN is worth the wait.
  const image = await fetchStoryOgImage(url, {
    timeoutMs: 5000,
    transcode: imagesBindingTranscoder(images),
  });
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
  return image && isCardSizedPhoto(image) ? image : null;
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
            const now = Date.now();
            const [fonts, model] = await Promise.all([
              loadStoryOgFonts((path) => loadOgFontAsset(env, path)),
              // The digest's stories, at most six: one batch within the
              // Worker's six outbound connections.
              dayCardModel({
                date,
                lang,
                items: archive.day?.items ?? [],
                today: date === latestArchiveDate(now),
                fetchPhoto: (url) =>
                  fetchTilePhoto(url, env?.OG_CACHE, env?.IMAGES),
              }),
            ]);
            // The day page names this URL as its og:image from 00:00, before
            // any story publishes. Until the day settles, its empty card is
            // served briefly and never stored, so the real card takes over
            // as soon as a story lands.
            const unsettledEmpty =
              model.layout.variant === "empty" &&
              !isSettledArchiveDate(date, now);
            const response = await ImageResponse.async(dayOgCard(model), {
              width: DAY_OG_WIDTH,
              height: DAY_OG_HEIGHT,
              ...(fonts.length ? { fonts } : {}),
              headers: {
                "Cache-Control": unsettledEmpty
                  ? EMPTY_RECENT_CACHE_CONTROL
                  : dayOgCacheControl(date),
                "Content-Language": lang,
              },
            });
            return unsettledEmpty
              ? { response, store: false as const }
              : response;
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
