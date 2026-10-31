import { cache, ImageResponse } from "@cf-wasm/og/workerd";
import { createFileRoute } from "@tanstack/react-router";
import { readSession } from "../../lib/db";
import { cachedOgResponse } from "../../lib/og-cache";
import { CANDIDATE_WINDOW_SEC } from "../../lib/og-cards";
import {
  loadOgFontAsset,
  loadStoryOgFonts,
  storyOgRenderOptions,
} from "../../lib/og-fonts";
import { SITE_OG_HOME_IMAGE_PATH } from "../../lib/site";
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

/** A story older than the off-Worker renderer's window (`CANDIDATE_WINDOW_SEC`)
 *  that has no stored card is not rendered on demand: crawlers walking the
 *  archive asked for ~200 such renders an hour, about 490 ms CPU each. They get
 *  the home card instead. A card already in R2 is still served as is. */
const ARCHIVE_FALLBACK_CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";

function isArchiveStory(publishedAtSec: number): boolean {
  return Date.now() / 1000 - publishedAtSec > CANDIDATE_WINDOW_SEC;
}

/** Bulk crawlers that walk story cards no reader asked for. On 2026-10-31
 *  they were ~97% of /api/og calls (KakaoBot alone ~3.3K a day, each a
 *  distinct card at ~400 ms CPU, ~1.5M CPU-ms a day). On a miss they get the
 *  home card; a card already rendered is still served. Link-preview bots for
 *  shares (Telegram, X, Slack, Discord, Facebook) are not listed. Kakao's
 *  search robot is matched by its help page, not "KakaoBot": KakaoTalk
 *  previews come as `kakaotalk-scrap`, and the
 *  `KakaoBot/1.0; +https://developers.kakao.com/bot` variant may be one. */
const BULK_CRAWLER =
  /cs\.kakao\.com\/helps_html|Amazonbot|PerplexityBot|GPTBot|ClaudeBot|Bytespider|meta-externalagent|ExaSearchBot|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|YandexBot/i;

function isBulkCrawler(userAgent: string | null): boolean {
  return userAgent !== null && BULK_CRAWLER.test(userAgent);
}

/** A crawler's home-card redirect must not be reused for a reader. */
const CRAWLER_FALLBACK_CACHE_CONTROL = "private, max-age=3600";

function homeCardRedirect(request: Request, cacheControl: string) {
  return {
    store: false as const,
    response: new Response(null, {
      status: 302,
      headers: {
        Location: new URL(SITE_OG_HOME_IMAGE_PATH, request.url).toString(),
        "Cache-Control": cacheControl,
      },
    }),
  };
}

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
            if (isArchiveStory(item.published_at)) {
              return homeCardRedirect(request, ARCHIVE_FALLBACK_CACHE_CONTROL);
            }
            if (isBulkCrawler(request.headers.get("user-agent"))) {
              return homeCardRedirect(request, CRAWLER_FALLBACK_CACHE_CONTROL);
            }
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
