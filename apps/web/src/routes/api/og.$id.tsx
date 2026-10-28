import { cache, ImageResponse } from "@cf-wasm/og/workerd";
import { createFileRoute } from "@tanstack/react-router";
import { readSession } from "../../lib/db";
import { cachedOgResponse } from "../../lib/og-cache";
import {
  loadOgFontAsset,
  loadStoryOgFonts,
  storyOgRenderOptions,
} from "../../lib/og-fonts";
import { idPrefixFromSlug } from "../../lib/slug";
import {
  fetchStoryOgImage,
  imagesBindingTranscoder,
  isCardSizedPhoto,
  type StoryImageFetchOptions,
  storyOgCard,
  storyOgImageCandidates,
  storyOgLanguage,
  storyOgObjectKey,
} from "../../lib/story-og";
import { getStory } from "../../lib/story-queries";

async function firstStoryOgImage(
  item: Parameters<typeof storyOgImageCandidates>[0],
  transcode: StoryImageFetchOptions["transcode"]
) {
  for (const url of storyOgImageCandidates(item)) {
    const image = await fetchStoryOgImage(url, { transcode });
    if (image && isCardSizedPhoto(image)) return image;
  }
  return null;
}

/** Story OG cards are deterministic per item id; rendered PNGs are
 * edge-cacheable for a week. */
const OG_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

/** A card drawn without the photo its story names: one fetch failed, and a
 *  later one may not, so this card is re-rendered after a week. */
const PHOTOLESS_MAX_AGE_SEC = 7 * 86_400;

export const Route = createFileRoute("/api/og/$id")({
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
        if (ctx?.waitUntil) cache.setExecutionContext(ctx);
        const db: D1Database | undefined = env?.DB;
        if (!db) {
          return Response.json(
            { error: "D1 binding DB not configured" },
            { status: 500 }
          );
        }
        // substr-prefix match treats "" as a wildcard — require a real
        // hex prefix like the permalink route does.
        const idPrefix = idPrefixFromSlug(
          params.id.replace(/\.png$/i, "").slice(0, 64)
        );
        if (!idPrefix) {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        const item = await getStory(readSession(db), idPrefix);
        if (!item) {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        const lang = storyOgLanguage(
          new URL(request.url).searchParams.get("lang")
        );
        return cachedOgResponse(
          request,
          ctx,
          async () => {
            const [fonts, image] = await Promise.all([
              loadStoryOgFonts((path) => loadOgFontAsset(env, path)),
              firstStoryOgImage(item, imagesBindingTranscoder(env?.IMAGES)),
            ]);
            const response = await ImageResponse.async(
              storyOgCard(item, image, lang),
              {
                ...storyOgRenderOptions(fonts),
                headers: {
                  "Cache-Control": OG_CACHE_CONTROL,
                  "Content-Language": lang,
                },
              }
            );
            return !image && storyOgImageCandidates(item).length > 0
              ? { response, maxAgeSec: PHOTOLESS_MAX_AGE_SEC }
              : response;
          },
          {
            bucket: env?.OG_CACHE,
            key: await storyOgObjectKey(item, lang),
          }
        );
      },
    },
  },
});
