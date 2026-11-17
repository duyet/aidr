/**
 * The day card render, shared by the `/api/og/date/$date` route and the
 * ingest `day-card` pre-render step: one closure, so a card drawn ahead of
 * time is byte-for-byte the card the route would draw on a miss.
 */
import { ImageResponse } from "@cf-wasm/og/workerd";
import {
  dayArchiveCacheControl,
  isSettledArchiveDate,
  latestArchiveDate,
} from "./day-archive";
import {
  DAY_OG_HEIGHT,
  DAY_OG_WIDTH,
  dayCardModel,
  dayOgCard,
} from "./day-og";
import { readSession } from "./db";
import { getDayArchive } from "./feed-queries";
import { loadOgFontAsset, loadStoryOgFonts } from "./og-fonts";
import {
  fetchStoryOgImage,
  imagesBindingTranscoder,
  isCardSizedPhoto,
  type StoryOgImage,
  storyOgImageFromBytes,
} from "./story-og";
import type { Lang } from "./types";

/** Settled days follow the page; a recent day's card refreshes hourly (the
 * pipeline's own cadence) instead of the page's 5 minutes, since each render
 * fetches up to six remote images. */
export function dayOgCacheControl(date: string): string {
  return isSettledArchiveDate(date, Date.now())
    ? dayArchiveCacheControl(date, Date.now())
    : "public, max-age=600, s-maxage=3600, stale-while-revalidate=3600";
}

/** A recent day with no story yet: its first stories should show within
 *  minutes, so the card is neither stored nor cached for long. */
export const EMPTY_RECENT_CACHE_CONTROL = "public, max-age=300";

/** Source photos are kept this long in R2 so EN and VI renders, and later
 *  hourly re-renders, reuse them instead of re-fetching from the publisher
 *  (some CDNs throttle repeat fetches). */
const SOURCE_PHOTO_MAX_AGE_MS = 7 * 86_400_000;

export async function sourcePhotoKey(url: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url)
  );
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `src/${hex}`;
}

export async function fetchTilePhoto(
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

/** The bindings a day card render reads. Optional so local dev and node
 *  tests can omit them, like the route's env. */
export interface DayOgRenderEnv {
  DB?: D1Database;
  ASSETS?: Fetcher;
  OG_CACHE?: R2Bucket;
  IMAGES?: ImagesBinding;
}

export interface DayOgRender {
  response: Response;
  /** False for an unsettled day's empty card: served, never stored. */
  store: boolean;
  /** R2 freshness, the route's `cachedOgResponse` option: a settled day
   *  never changes; a recent one re-renders hourly. */
  maxAgeSec: number;
}

export async function renderDayCard(
  env: DayOgRenderEnv,
  date: string,
  lang: Lang,
  now: number
): Promise<DayOgRender> {
  const db = env.DB;
  if (!db) throw new Error("D1 binding DB not configured");
  const archive = await getDayArchive(readSession(db), date);
  const [fonts, model] = await Promise.all([
    loadStoryOgFonts((path) => loadOgFontAsset(env, path)),
    // The digest's stories, at most six: one batch within the
    // Worker's six outbound connections.
    dayCardModel({
      date,
      lang,
      items: archive.day?.items ?? [],
      today: date === latestArchiveDate(now),
      fetchPhoto: (url) => fetchTilePhoto(url, env.OG_CACHE, env.IMAGES),
    }),
  ]);
  // The day page names this URL as its og:image from 00:00, before
  // any story publishes. Until the day settles, its empty card is
  // served briefly and never stored, so the real card takes over
  // as soon as a story lands.
  const unsettledEmpty =
    model.layout.variant === "empty" && !isSettledArchiveDate(date, now);
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
  return {
    response,
    store: !unsettledEmpty,
    maxAgeSec: isSettledArchiveDate(date, now) ? 30 * 86_400 : 3600,
  };
}