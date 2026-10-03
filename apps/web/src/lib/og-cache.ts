/**
 * Two-tier cache for rendered OG PNGs, so a card is rendered once rather
 * than per request or per region:
 *
 * 1. Edge cache (Cache API, per data center), keyed by URL. A Worker
 *    response is not stored by the CDN on its own.
 * 2. R2 (`OG_CACHE`), shared by every data center, keyed by path + lang.
 *
 * A miss on both renders, then fills both in the background.
 */

/** Bump when a card's design or selection changes: a deploy does not purge
 *  either tier, so old renders would otherwise live out their TTL. */
const OG_RENDER_VERSION = "6";

type WaitUntil = { waitUntil?: (p: Promise<unknown>) => void } | undefined;

export interface OgCacheOptions {
  /** Shared tier; omitted (tests, local dev) means edge cache only. */
  bucket?: R2Bucket;
  /** How long an R2 copy stays fresh. Settled content can pass a long one. */
  maxAgeSec: number;
}

function edgeCache(): Cache | null {
  const c = (globalThis as { caches?: { default?: Cache } }).caches;
  return c?.default ?? null;
}

/** R2 key: `v4/api/og/date/2026-10-03.png/vi`. Query strings other than
 *  `lang` (cache busters, utm) never create a new object. */
export function ogObjectKey(url: URL): string {
  const lang = url.searchParams.get("lang") === "vi" ? "vi" : "en";
  return `v${OG_RENDER_VERSION}${url.pathname}/${lang}`;
}

function background(ctx: WaitUntil, work: Promise<unknown>): Promise<void> {
  const safe = work.then(
    () => undefined,
    () => undefined
  );
  if (ctx?.waitUntil) {
    ctx.waitUntil(safe);
    return Promise.resolve();
  }
  return safe;
}

/** Serve a cached render, else render, store (in the background) and return. */
export async function cachedOgResponse(
  request: Request,
  ctx: WaitUntil,
  render: () => Promise<Response>,
  options: OgCacheOptions = { maxAgeSec: 0 }
): Promise<Response> {
  const url = new URL(request.url);
  const cache = edgeCache();
  const keyUrl = new URL(url);
  keyUrl.searchParams.set("_r", OG_RENDER_VERSION);
  const edgeKey = new Request(keyUrl.toString(), { method: "GET" });
  const hit = await cache?.match(edgeKey).catch(() => undefined);
  // A cached Response has immutable headers; the router appends its own, so
  // hand it a mutable copy.
  if (hit) return new Response(hit.body, hit);

  const { bucket, maxAgeSec } = options;
  const objectKey = ogObjectKey(url);
  if (bucket && maxAgeSec > 0) {
    const obj = await bucket.get(objectKey).catch(() => null);
    const renderedAt = Number(obj?.customMetadata?.renderedAt ?? 0);
    if (obj && Date.now() - renderedAt < maxAgeSec * 1000) {
      const headers = new Headers({
        "Content-Type": "image/png",
        "Cache-Control":
          obj.customMetadata?.cacheControl ?? "public, max-age=3600",
        "Content-Language": url.searchParams.get("lang") === "vi" ? "vi" : "en",
      });
      const res = new Response(obj.body, { headers });
      if (cache) await background(ctx, cache.put(edgeKey, res.clone()));
      return res;
    }
  }

  const res = await render();
  if (!res.ok) return res;
  const bytes = await res.arrayBuffer();
  const out = new Response(bytes, res);
  if (cache) await background(ctx, cache.put(edgeKey, out.clone()));
  if (bucket && maxAgeSec > 0) {
    await background(
      ctx,
      bucket.put(objectKey, bytes, {
        httpMetadata: { contentType: "image/png" },
        customMetadata: {
          renderedAt: String(Date.now()),
          cacheControl: res.headers.get("Cache-Control") ?? "",
        },
      })
    );
  }
  return out;
}
