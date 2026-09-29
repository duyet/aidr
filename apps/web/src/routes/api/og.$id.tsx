import { cache, ImageResponse } from "@cf-wasm/og/workerd";
import { createFileRoute } from "@tanstack/react-router";
import { readSession } from "../../lib/db";
import { loadStoryOgFonts, storyOgRenderOptions } from "../../lib/og-fonts";
import { idPrefixFromSlug } from "../../lib/slug";
import {
  fetchStoryOgImage,
  storyOgCard,
  storyOgLanguage,
} from "../../lib/story-og";
import { getStory } from "../../lib/story-queries";

/** Story OG cards are deterministic per item id; rendered PNGs are
 * edge-cacheable for a week. */
const OG_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

type AssetEnv = { ASSETS?: { fetch: (r: Request) => Promise<Response> } };

function assetsGet(path: string): Request {
  // Same trick as worker/public-assets.ts — bypass SPA not_found handling.
  return new Request(`https://assets.local${path}`, {
    method: "GET",
    headers: { Accept: "*/*" },
  });
}

async function loadFont(
  env: AssetEnv | undefined,
  path: string
): Promise<ArrayBuffer | null> {
  try {
    const res = await env?.ASSETS?.fetch(assetsGet(path));
    if (!res?.ok) return null;
    // A miss answered with the SPA shell would be a >1000 byte HTML buffer,
    // and satori throws on that instead of degrading. Same guard as
    // worker/public-assets.ts, because it is the same binding.
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ctype.includes("text/html")) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 1000 ? buf : null;
  } catch {
    return null;
  }
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
        const [fonts, image] = await Promise.all([
          loadStoryOgFonts((path) => loadFont(env, path)),
          fetchStoryOgImage(item.image_url),
        ]);
        return await ImageResponse.async(storyOgCard(item, image, lang), {
          ...storyOgRenderOptions(fonts),
          headers: {
            "Cache-Control": OG_CACHE_CONTROL,
            "Content-Language": lang,
          },
        });
      },
    },
  },
});
