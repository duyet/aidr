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

/** Public host of the `aidr-og` R2 bucket. A URL on it never reaches the Worker. */
export const OG_PUBLIC_ORIGIN = "https://og.aidr.today";

/** Static, immutable copy of one versioned day card, served at og.aidr.today.
 *  `version` is the tile-id token, so the key names the card's inputs. It
 *  lives outside `og-day/v<n>/` so the Worker route's own writes never touch it. */
export function dayOgStaticKey(
  date: string,
  lang: "en" | "vi",
  version: string
): string {
  return `og-day-static/${date}/${lang}/${version}.png`;
}

export function dayOgPublicUrl(
  date: string,
  lang: "en" | "vi",
  version: string
): string {
  return `${OG_PUBLIC_ORIGIN}/${dayOgStaticKey(date, lang, version)}`;
}

const STATIC_CARD_CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function putDayCardStatic(
  bucket: R2Bucket,
  key: string,
  bytes: Uint8Array
): Promise<void> {
  await bucket.put(key, bytes, {
    httpMetadata: {
      contentType: "image/png",
      cacheControl: STATIC_CARD_CACHE_CONTROL,
    },
  });
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
      putDayCardObject(bucket, objectKey, out.clone(), maxAgeSec)
    );
  }
  return out;
}

/** The one R2 put for a rendered card, shared by the request path above and
 *  the ingest `day-card` pre-render step so their metadata cannot drift.
 *  `contentVersion` is optional provenance: the step stamps the tile-id hash
 *  it drew, so a later run can tell its own unchanged render from a
 *  request-path put (which carries no stamp). Omitted keeps the exact
 *  request-path metadata. */
export async function putDayCardObject(
  bucket: R2Bucket,
  key: string,
  response: Response,
  maxAgeSec?: number,
  contentVersion?: string
): Promise<void> {
  const bytes = await response.arrayBuffer();
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: {
      ...(maxAgeSec === undefined
        ? {}
        : { expiresAt: String(Date.now() + maxAgeSec * 1000) }),
      ...(contentVersion === undefined ? {} : { contentVersion }),
      cacheControl: response.headers.get("Cache-Control") ?? "",
    },
  });
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A pre-rendered card must be a whole PNG of the card's own size before it
 *  is stored: a truncated or error-body render would otherwise be served
 *  from R2 until its TTL. Expected dimensions are passed in (the caller
 *  knows `DAY_OG_WIDTH`/`DAY_OG_HEIGHT`) to keep this module free of the
 *  card's React graph. The floor is a sanity bound, not a quality bar: a
 *  settled day's near-empty card compresses small, and the route stores it
 *  without validation, so rejecting it here would only add false failures. */
export function validateDayCardPng(
  bytes: Uint8Array,
  width: number,
  height: number
): boolean {
  if (bytes.byteLength < 2_000) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  // The first chunk is IHDR: 4-byte length, 4-byte type, then width/height.
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(16) !== width || view.getUint32(20) !== height) {
    return false;
  }
  // Completeness check, not full PNG validation: a whole PNG ends with the
  // IEND chunk (zero length, the type, the fixed CRC), and a render cut off
  // mid-stream keeps a valid IHDR but loses this tail — the truncation the
  // size floor cannot see. Chunk bodies and their CRCs are not walked.
  const end = bytes.byteLength;
  return (
    view.getUint32(end - 12) === 0 &&
    String.fromCharCode(...bytes.subarray(end - 8, end - 4)) === "IEND" &&
    view.getUint32(end - 4) === 0xae426082
  );
}
