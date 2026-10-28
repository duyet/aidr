/**
 * Two-tier cache for rendered OG PNGs, so a card is rendered once rather
 * than per request or per region:
 *
 * 1. Edge cache (Cache API, per data center), keyed by URL plus the R2 key.
 *    A Worker response is not stored by the CDN on its own.
 * 2. R2 (`OG_CACHE`), shared by every data center, keyed by the caller.
 *
 * A miss on both renders, then fills both in the background. Story and day
 * cards keep separate key namespaces (`og-story/`, `og-day/`), so a design
 * change to one never re-renders the other.
 */

/** Bump when the day card's design or selection changes: a deploy does not
 *  purge either tier, so old renders would otherwise live out their TTL. */
export const DAY_OG_RENDER_VERSION = "1";

type WaitUntil = { waitUntil?: (p: Promise<unknown>) => void } | undefined;

export interface OgCacheOptions {
  /** Shared tier; omitted (tests, local dev) means edge cache only. */
  bucket?: R2Bucket;
  /** R2 key. A key that addresses the card's inputs needs no TTL. */
  key: string;
  /** How long an R2 copy stays fresh; omitted keeps it until the key
   *  changes. */
  maxAgeSec?: number;
}

function edgeCache(): Cache | null {
  const c = (globalThis as { caches?: { default?: Cache } }).caches;
  return c?.default ?? null;
}

/** Day card R2 key: `og-day/v1/api/og/date/2026-10-03.png/vi`, or
 *  `…/vi/k3f0a` when `v` is set. Telegram caches an image by its full URL,
 *  so the digest sends a `v` of the tile ids and that value is part of the
 *  key. Other query strings (utm) stay out. */
export function dayOgObjectKey(
  url: URL,
  version: string = DAY_OG_RENDER_VERSION
): string {
  const lang = url.searchParams.get("lang") === "vi" ? "vi" : "en";
  const stamp = url.searchParams.get("v") ?? "";
  const suffix = /^[a-z0-9]{4,16}$/.test(stamp) ? `/${stamp}` : "";
  return `og-day/v${version}${url.pathname}/${lang}${suffix}`;
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

/** A render served as is and kept out of both tiers: its content is about
 *  to change (a day card before the day's first story). */
export interface OgUnstored {
  response: Response;
  store: false;
}

/** A render kept in R2 for a bounded time even though its key carries no
 *  TTL: a card drawn without its photo, which a later fetch may still get. */
export interface OgExpiring {
  response: Response;
  maxAgeSec: number;
}

export async function cachedOgResponse(
  request: Request,
  ctx: WaitUntil,
  render: () => Promise<Response | OgUnstored | OgExpiring>,
  options: OgCacheOptions
): Promise<Response> {
  const url = new URL(request.url);
  const cache = edgeCache();
  const { bucket, key: objectKey } = options;
  const keyUrl = new URL(url);
  keyUrl.searchParams.set("_k", objectKey);
  const edgeKey = new Request(keyUrl.toString(), { method: "GET" });
  const hit = await cache?.match(edgeKey).catch(() => undefined);
  // A cached Response has immutable headers; the router appends its own, so
  // hand it a mutable copy.
  if (hit) return new Response(hit.body, hit);

  if (bucket) {
    const obj = await bucket.get(objectKey).catch(() => null);
    const expiresAt = Number(obj?.customMetadata?.expiresAt ?? 0);
    if (obj && (!expiresAt || Date.now() < expiresAt)) {
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

  const rendered = await render();
  if (!(rendered instanceof Response) && "store" in rendered) {
    return rendered.response;
  }
  const res = rendered instanceof Response ? rendered : rendered.response;
  const maxAgeSec =
    rendered instanceof Response ? options.maxAgeSec : rendered.maxAgeSec;
  if (!res.ok || !res.headers.get("content-type")?.startsWith("image/png")) {
    return res;
  }
  const bytes = await res.arrayBuffer();
  const out = new Response(bytes, res);
  if (cache) await background(ctx, cache.put(edgeKey, out.clone()));
  if (bucket) {
    await background(
      ctx,
      bucket.put(objectKey, bytes, {
        httpMetadata: { contentType: "image/png" },
        customMetadata: {
          ...(maxAgeSec === undefined
            ? {}
            : { expiresAt: String(Date.now() + maxAgeSec * 1000) }),
          cacheControl: res.headers.get("Cache-Control") ?? "",
        },
      })
    );
  }
  return out;
}
