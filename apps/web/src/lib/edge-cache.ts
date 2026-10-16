/**
 * Workers Cache API in front of SSR. A Worker response is not stored by the
 * CDN on its own, so without this every distinct query string re-renders the
 * page. The key drops tracking params so extension/newsletter/social clicks
 * share one entry with the clean URL.
 *
 * Only public, locale-keyed HTML is stored: never `private`/`no-store`, never
 * a response with `Set-Cookie`, never a non-200, never a request carrying
 * auth. Locale policy itself stays in `locale-response.ts`.
 *
 * An entry is fresh for the `s-maxage` its render declared, then served STALE
 * for up to `EDGE_CACHE_STALE_S` while one background render per key per
 * isolate replaces it. The stored copy carries the long `s-maxage` so the
 * Cache API keeps it through the stale window; the client always receives
 * the render's own Cache-Control and Vary.
 */
import { resolveLocale } from "./lang";
import {
  isLanguageNeutralSsrPath,
  isLocalizedSsrPath,
  isPrivateSsrPath,
} from "./locale-routing";
import { hasCanonicalLocaleQuery } from "./locale-url";
import { markStage, withoutRequestTiming } from "./request-timing";

export const EDGE_CACHE_HEADER = "x-aidr-cache";
/**
 * Day and week archives pick their locale like a story page but stamp their
 * own Cache-Control in the route, so `locale-routing` does not list them as
 * localized. They cache the same way: keyed by `?lang=`, or by the resolved
 * language when bare.
 */
const ARCHIVE_SSR_PATH = /^\/(?:date\/\d{4}-\d{2}-\d{2}|week\/\d{4}-W\d{2})$/;

function isLocaleKeyedSsrPath(pathname: string): boolean {
  return isLocalizedSsrPath(pathname) || ARCHIVE_SSR_PATH.test(pathname);
}
/** Bump to orphan every stored page after a markup-shape change. */
const EDGE_CACHE_VERSION = "2";
/**
 * A dormant colo must never serve content older than this. Ingest publishes
 * every 30 minutes, so 1h keeps a stale homepage or Telegram "full day" link
 * within about two editions of the live one.
 */
export const EDGE_CACHE_STALE_S = 3600;
/**
 * Cap on the fresh window, whatever `s-maxage` a page declares: a settled day
 * archive says a day, and Worker fresh + stale + CDN lifetime must stay under
 * `ASSET_RETENTION_MS` (html-cache.test.ts) or the HTML outlives its chunks.
 */
export const EDGE_CACHE_FRESH_MAX_S = 3600;

type WaitUntil = { waitUntil?: (p: Promise<unknown>) => void } | undefined;

const TRACKING_PARAMS = new Set(["ref", "fbclid", "gclid"]);

export function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return (
    TRACKING_PARAMS.has(key) || key.startsWith("utm_") || key.startsWith("mc_")
  );
}

/** Origin + path + non-tracking params, sorted. Hash never reaches a Worker. */
export function normalizedCacheUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  const kept = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a, av], [b, bv]) =>
      a === b ? av.localeCompare(bv) : a.localeCompare(b)
    );
  url.search = "";
  for (const [name, value] of kept) url.searchParams.append(name, value);
  url.hash = "";
  return url;
}

/** Clerk session / dev-browser cookies and bearer tokens mean a signed-in view. */
export function hasAuthSignal(request: Request): boolean {
  if (request.headers.get("authorization")) return true;
  const cookie = request.headers.get("cookie");
  if (!cookie) return false;
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    const name = (eq === -1 ? part : part.slice(0, eq)).trim();
    const value = eq === -1 ? "" : part.slice(eq + 1).trim();
    if (name.startsWith("__session") || name.startsWith("__clerk")) return true;
    // Clerk sets `__client_uat=0` for signed-out visitors.
    if (name.startsWith("__client_uat") && value !== "0" && value !== "") {
      return true;
    }
  }
  return false;
}

/**
 * Cache key for a request, or null when it must bypass the cache. Localized
 * pages are keyed by their explicit `?lang=`; language-neutral pages render
 * navigation in the requester's resolved locale, so that locale joins the key.
 */
export function edgeCacheKey(request: Request): Request | null {
  if (request.method !== "GET") return null;
  const accept = request.headers.get("accept") || "*/*";
  if (!/(^|,)\s*(\*\/\*|text\/html)/.test(accept)) return null;
  if (hasAuthSignal(request)) return null;
  const url = normalizedCacheUrl(request.url);
  if (isPrivateSsrPath(url.pathname, url.search)) return null;
  if (isLanguageNeutralSsrPath(url.pathname)) {
    const locale = resolveLocale({
      search: url.search,
      cookie: request.headers.get("cookie"),
      acceptLanguage: request.headers.get("accept-language"),
    });
    if (!locale.ok) return null;
    url.searchParams.set("__l", locale.lang);
  } else if (
    !(isLocaleKeyedSsrPath(url.pathname) && hasCanonicalLocaleQuery(url.search))
  ) {
    return null;
  }
  url.searchParams.set("__v", EDGE_CACHE_VERSION);
  return new Request(url.toString(), { method: "GET" });
}

/** Seconds a shared cache may keep the response, or 0 when it must not. */
export function sharedMaxAge(response: Response): number {
  if (response.status !== 200) return 0;
  if (response.headers.has("set-cookie")) return 0;
  const vary = response.headers.get("vary") ?? "";
  if (vary.split(",").some((v) => v.trim() === "*")) return 0;
  const control = (response.headers.get("cache-control") ?? "").toLowerCase();
  if (/\b(private|no-store|no-cache)\b/.test(control)) return 0;
  const match = /\bs-maxage=(\d+)/.exec(control);
  return match ? Number(match[1]) : 0;
}

function edgeCache(): Cache | null {
  const c = (globalThis as { caches?: { default?: Cache } }).caches;
  return c?.default ?? null;
}

type CacheState = "HIT" | "STALE" | "MISS";

function stamp(response: Response, state: CacheState): Response {
  // Cached and freshly built responses may have immutable headers.
  const out = new Response(response.body, response);
  out.headers.set(EDGE_CACHE_HEADER, state);
  // Readable by the page (same origin) so web-vitals can split by cache.
  out.headers.append("server-timing", `aidr-cache;desc=${state}`);
  return out;
}

const CLIENT_CC = "x-aidr-client-cc";
const CLIENT_VARY = "x-aidr-client-vary";
const STORED_AT = "x-aidr-stored-at";
const FRESH = "x-aidr-fresh";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Client headers move to `x-aidr-*` so the Cache API keeps the copy through the stale window. */
function toStored(response: Response, fresh: number): Response {
  const stored = new Response(response.clone().body, response);
  stored.headers.set(
    CLIENT_CC,
    response.headers.get("cache-control") ?? "private, no-store"
  );
  const vary = response.headers.get("vary");
  if (vary) stored.headers.set(CLIENT_VARY, vary);
  // The key already carries the locale, and the Cache API would otherwise
  // refuse to match on a different Cookie.
  stored.headers.delete("vary");
  stored.headers.set(STORED_AT, String(nowSeconds()));
  stored.headers.set(FRESH, String(fresh));
  stored.headers.set("cache-control", `s-maxage=${fresh + EDGE_CACHE_STALE_S}`);
  return stored;
}

function toClient(hit: Response, state: CacheState): Response {
  const out = stamp(hit, state);
  out.headers.set(
    "cache-control",
    out.headers.get(CLIENT_CC) ?? "private, no-store"
  );
  const vary = out.headers.get(CLIENT_VARY);
  if (vary) out.headers.set("vary", vary);
  for (const h of [CLIENT_CC, CLIENT_VARY, STORED_AT, FRESH]) {
    out.headers.delete(h);
  }
  return out;
}

function entryState(hit: Response): Exclude<CacheState, "MISS"> | "EXPIRED" {
  const age = nowSeconds() - Number(hit.headers.get(STORED_AT) ?? 0);
  const fresh = Number(hit.headers.get(FRESH) ?? 0);
  if (age <= fresh) return "HIT";
  if (age <= fresh + EDGE_CACHE_STALE_S) return "STALE";
  return "EXPIRED";
}

/** A render outside the cache still ends the `ssr` stage. */
async function renderStaged(
  render: () => Promise<Response>
): Promise<Response> {
  const response = await render();
  markStage("ssr");
  return response;
}

/** Keys with a background revalidation in flight in this isolate. */
const revalidating = new Set<string>();

/**
 * Match policy shared by both entry points. `declaredFresh` returns the
 * seconds a render counts as fresh, or 0 when it must not be stored.
 */
async function serveThroughCache(
  cache: Cache,
  key: Request,
  ctx: WaitUntil,
  render: () => Promise<Response>,
  declaredFresh: (response: Response) => number
): Promise<Response> {
  const freshFor = (response: Response) =>
    Math.min(declaredFresh(response), EDGE_CACHE_FRESH_MAX_S);
  const hit = await cache.match(key).catch(() => undefined);
  markStage("cache");
  if (hit) {
    const state = entryState(hit);
    if (state === "HIT") return toClient(hit, "HIT");
    if (state === "STALE") {
      // Without waitUntil nothing can outlive the response, so serve as a hit.
      if (!ctx?.waitUntil) return toClient(hit, "HIT");
      if (!revalidating.has(key.url)) {
        revalidating.add(key.url);
        // The render outlives this response, so its marks must not land in
        // this request's Server-Timing.
        ctx.waitUntil(
          withoutRequestTiming(() =>
            render()
              .then((response) => {
                const fresh = freshFor(response);
                if (fresh > 0) return cache.put(key, toStored(response, fresh));
              })
              .catch(() => undefined)
              .finally(() => revalidating.delete(key.url))
          )
        );
      }
      return toClient(hit, "STALE");
    }
  }

  const response = await render();
  markStage("ssr");
  const fresh = freshFor(response);
  if (fresh <= 0) return response;
  const write = cache
    .put(key, toStored(response, fresh))
    .catch(() => undefined);
  if (ctx?.waitUntil) ctx.waitUntil(write);
  else await write;
  return stamp(response, "MISS");
}

/**
 * Serve `render()` through the edge cache when the request qualifies. `render`
 * must return the final, policy-stamped response (`withSsrLocaleResponse`).
 */
export async function cachedSsrResponse(
  request: Request,
  ctx: WaitUntil,
  render: () => Promise<Response>
): Promise<Response> {
  const cache = edgeCache();
  const key = cache ? edgeCacheKey(request) : null;
  if (!(cache && key)) return renderStaged(render);
  return serveThroughCache(cache, key, ctx, render, sharedMaxAge);
}

/**
 * Resolved language for a GET HTML request to a localized page that carries
 * no canonical `?lang=` (bare `/`), or null when it must not be cached.
 */
export function bareLocalizedCacheLang(request: Request): string | null {
  if (request.method !== "GET") return null;
  const accept = request.headers.get("accept") || "*/*";
  if (!/(^|,)\s*(\*\/\*|text\/html)/.test(accept)) return null;
  if (hasAuthSignal(request)) return null;
  const url = normalizedCacheUrl(request.url);
  if (!isLocaleKeyedSsrPath(url.pathname)) return null;
  if (hasCanonicalLocaleQuery(url.search)) return null;
  if (isPrivateSsrPath(url.pathname, url.search)) return null;
  const locale = resolveLocale({
    search: url.search,
    cookie: request.headers.get("cookie"),
    acceptLanguage: request.headers.get("accept-language"),
  });
  return locale.ok ? locale.lang : null;
}

/**
 * Worker-cache a response whose language comes from Cookie/Accept-Language
 * (bare `/feed.xml`). The resolved `lang` joins the key, so readers never
 * share another locale's copy; the client still receives the original
 * private/varied headers, so no downstream cache can mix languages either.
 * The entry stays fresh for `sharedControl`'s `s-maxage`.
 */
export async function cachedLocaleResponse(
  request: Request,
  ctx: WaitUntil,
  lang: string,
  sharedControl: string,
  render: () => Promise<Response>
): Promise<Response> {
  const cache = edgeCache();
  if (!cache || request.method !== "GET" || hasAuthSignal(request)) {
    return renderStaged(render);
  }
  const url = normalizedCacheUrl(request.url);
  url.searchParams.set("__l", lang);
  url.searchParams.set("__v", EDGE_CACHE_VERSION);
  const key = new Request(url.toString(), { method: "GET" });
  const fresh = Number(/\bs-maxage=(\d+)/.exec(sharedControl)?.[1] ?? 0);
  return serveThroughCache(cache, key, ctx, render, (response) =>
    response.status !== 200 || response.headers.has("set-cookie") ? 0 : fresh
  );
}
