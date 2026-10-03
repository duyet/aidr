/**
 * Edge cache for rendered OG PNGs. A Worker response is not stored by the
 * CDN on its own, so without this every card request re-fetches the story
 * images and re-runs satori. Keyed by the full URL (path + `?lang=`).
 */
type WaitUntil = { waitUntil?: (p: Promise<unknown>) => void } | undefined;

function edgeCache(): Cache | null {
  const c = (globalThis as { caches?: { default?: Cache } }).caches;
  return c?.default ?? null;
}

/** Serve a cached render, else render, store (in the background) and return. */
export async function cachedOgResponse(
  request: Request,
  ctx: WaitUntil,
  render: () => Promise<Response>
): Promise<Response> {
  const cache = edgeCache();
  const key = new Request(new URL(request.url).toString(), { method: "GET" });
  const hit = await cache?.match(key).catch(() => undefined);
  // A cached Response has immutable headers; the router appends its own, so
  // hand it a mutable copy.
  if (hit) return new Response(hit.body, hit);
  const res = await render();
  if (cache && res.ok) {
    const put = cache.put(key, res.clone()).catch(() => undefined);
    if (ctx?.waitUntil) ctx.waitUntil(put);
    else await put;
  }
  return res;
}
