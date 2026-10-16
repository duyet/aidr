import { createFileRoute } from "@tanstack/react-router";
import { readSession } from "../../lib/db";
import { idPrefixFromSlug } from "../../lib/slug";
import {
  isSafeStoryImageUrl,
  storyOgImageCandidates,
} from "../../lib/story-og";
import { getStory } from "../../lib/story-queries";
import { resizeCdnImageUrl, sanitizeImageUrl } from "../../lib/tldr-images";

/** Pixels on each side. The feed thumb is 48 CSS px (`2lh`), so one square
 *  covers a 3x display without a srcset. */
export const THUMB_SIDE = 144;

const THUMB_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

/** A miss (publisher down, not an image, no binding) sends the browser to
 *  the publisher URL it would have loaded before this route existed, so the
 *  thumb still shows. Short-lived so a transient failure is retried. */
const FALLBACK_CACHE_CONTROL = "public, max-age=300";

const SOURCE_TIMEOUT_MS = 5000;

async function fetchSource(url: string): Promise<Response | null> {
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
    if (
      !response.ok ||
      !response.body ||
      !type?.startsWith("image/") ||
      type === "image/svg+xml"
    ) {
      return null;
    }
    return response;
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
  const upstream = await fetchSource(source);
  if (!upstream?.body) return null;
  try {
    const out = await images
      .input(upstream.body)
      .transform({ width: THUMB_SIDE, height: THUMB_SIDE, fit: "cover" })
      .output({ format: "image/webp", quality: 75 });
    return out.response();
  } catch {
    return null;
  }
}

/**
 * Resized feed thumbnail for one of a story's own images.
 *
 * `u` must be an image the story already carries (`image_url` or a manifest
 * image asset), so this is not an open image proxy: an unknown URL is a 404
 * before any fetch. The source is fetched once per edge location and
 * resized through the Images binding to a `THUMB_SIDE` square WebP, which
 * turns a 1 MB publisher hero into a few KB for a 48 px box.
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
        const idPrefix = idPrefixFromSlug(params.id.slice(0, 64));
        const requested = new URL(request.url).searchParams.get("u");
        const wanted = sanitizeImageUrl(requested);
        if (!idPrefix || !wanted || !isSafeStoryImageUrl(wanted)) {
          return Response.json({ error: "not found" }, { status: 404 });
        }

        const cache = (globalThis as { caches?: { default?: Cache } }).caches
          ?.default;
        const cacheKey = new Request(request.url, { method: "GET" });
        const hit = await cache?.match(cacheKey).catch(() => undefined);
        if (hit) return new Response(hit.body, hit);

        const item = await getStory(readSession(db), idPrefix);
        const owned = item
          ? storyOgImageCandidates(item).some(
              (candidate) => sanitizeImageUrl(candidate) === wanted
            )
          : false;
        if (!owned) {
          return Response.json({ error: "not found" }, { status: 404 });
        }

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
