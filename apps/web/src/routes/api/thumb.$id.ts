import { createFileRoute } from "@tanstack/react-router";
import { readSession } from "../../lib/db";
import {
  isSafeStoryImageUrl,
  readBoundedBody,
  storyOgImageCandidates,
} from "../../lib/story-og";
import { getStoryMedia } from "../../lib/story-queries";
import { resizeCdnImageUrl, sanitizeImageUrl } from "../../lib/tldr-images";

/** Pixels on each side. The feed thumb is 48 CSS px (`2lh`), so one square
 *  covers a 3x display without a srcset. */
export const THUMB_SIDE = 144;

/** Bump to drop every edge copy on the next deploy (encoder or size change). */
export const THUMB_RENDER_VERSION = "1";

/** Larger sources are a miss. The Worker holds the whole body in memory,
 *  and the largest homepage thumb source on 2026-10-16 was 1.1 MB. */
export const MAX_THUMB_SOURCE_BYTES = 8_000_000;

const ITEM_ID = /^[0-9a-f]{64}$/;

const THUMB_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

/** A miss (publisher down, not an image, no binding) sends the browser to
 *  the publisher URL it would have loaded before this route existed, so the
 *  thumb still shows. Short-lived so a transient failure is retried. */
const FALLBACK_CACHE_CONTROL = "public, max-age=300";

/** Covers the headers and the whole body, so a publisher that trickles
 *  bytes cannot hold the Worker past it. */
export const SOURCE_TIMEOUT_MS = 5000;

async function fetchSource(url: string): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      // "manual" hands a 3xx back unfollowed, so a publisher can never bounce
      // the Worker to a private host. A redirect is a miss.
      redirect: "manual",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        Accept: "image/webp,image/png,image/jpeg,image/gif",
        "User-Agent":
          "Mozilla/5.0 (compatible; AIDRBot/1.0; +https://aidr.today)",
      },
      signal: controller.signal,
    });
    const type = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    const length = response.headers.get("content-length");
    if (
      !response.ok ||
      !type?.startsWith("image/") ||
      type === "image/svg+xml" ||
      (length !== null &&
        (!/^\d+$/.test(length) || Number(length) > MAX_THUMB_SOURCE_BYTES))
    ) {
      return null;
    }
    return await readBoundedBody(response, MAX_THUMB_SOURCE_BYTES);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function renderThumb(
  images: ImagesBinding,
  source: string
): Promise<Response | null> {
  const bytes = await fetchSource(source);
  if (!bytes) return null;
  try {
    const out = await images
      .input(new Blob([new Uint8Array(bytes)]).stream())
      .transform({ width: THUMB_SIDE, height: THUMB_SIDE, fit: "cover" })
      .output({ format: "image/webp", quality: 75 });
    return out.response();
  } catch {
    return null;
  }
}

/** One edge entry per (item, image, render version), whatever else the
 *  request URL carries, so query noise cannot force a fresh fetch. */
function thumbCacheKey(origin: string, id: string, wanted: string): Request {
  const key = new URL(`/api/thumb/v${THUMB_RENDER_VERSION}/${id}`, origin);
  key.searchParams.set("u", wanted);
  return new Request(key.toString(), { method: "GET" });
}

/**
 * Resized feed thumbnail for one of a story's own images.
 *
 * `u` must be an image the story already carries (`image_url` or a manifest
 * image asset), so this is not an open image proxy: an unknown URL is a 404
 * before any fetch. Ownership is read on every request, cached or not, so a
 * removed image stops serving at once. The source is fetched once per edge
 * location and resized through the Images binding to a `THUMB_SIDE` square
 * WebP, which turns a 1 MB publisher hero into a few KB for a 48 px box.
 */
export const Route = createFileRoute("/api/thumb/$id")({
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
        const ctx = context?.cloudflare?.ctx ?? context?.ctx;
        const db: D1Database | undefined = env?.DB;
        if (!db) {
          return Response.json(
            { error: "D1 binding DB not configured" },
            { status: 500 }
          );
        }
        const requested = new URL(request.url).searchParams.get("u");
        const wanted = sanitizeImageUrl(requested);
        if (
          !ITEM_ID.test(params.id) ||
          !wanted ||
          !isSafeStoryImageUrl(wanted)
        ) {
          return Response.json({ error: "not found" }, { status: 404 });
        }

        const item = await getStoryMedia(readSession(db), params.id);
        const owned = item
          ? storyOgImageCandidates(item).some(
              (candidate) => sanitizeImageUrl(candidate) === wanted
            )
          : false;
        if (!owned) {
          return Response.json({ error: "not found" }, { status: 404 });
        }

        const cache = (globalThis as { caches?: { default?: Cache } }).caches
          ?.default;
        const cacheKey = thumbCacheKey(
          new URL(request.url).origin,
          params.id,
          wanted
        );
        const hit = await cache?.match(cacheKey).catch(() => undefined);
        if (hit) return new Response(hit.body, hit);

        // A CDN that already serves a small variant (twimg `name=small`)
        // saves the egress before the resize.
        const source = resizeCdnImageUrl(wanted, "thumb") ?? wanted;
        const images: ImagesBinding | undefined = env?.IMAGES;
        const rendered = images ? await renderThumb(images, source) : null;
        if (!rendered) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: wanted,
              "Cache-Control": FALLBACK_CACHE_CONTROL,
            },
          });
        }
        const bytes = await rendered.arrayBuffer();
        const res = new Response(bytes, {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": THUMB_CACHE_CONTROL,
            "X-Content-Type-Options": "nosniff",
          },
        });
        if (cache) {
          const store = cache.put(cacheKey, res.clone()).catch(() => undefined);
          if (ctx?.waitUntil) ctx.waitUntil(store);
          else await store;
        }
        return res;
      },
    },
  },
});
