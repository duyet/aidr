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
 *
 * The homepage has a second tier in KV (`global-html-cache.ts`): a colo with
 * no usable copy serves another colo's stored render instead of rendering.
 */
import {
  EDGE_CACHE_FRESH_MAX_S,
  EDGE_CACHE_STALE_S,
} from "./edge-cache-window";
import {
  GLOBAL_WRITE_INTERVAL_S,
  type GlobalHtmlCache,
  isGloballyCachedKey,
} from "./global-html-cache";
import { resolveLocale } from "./lang";
import {
  isLanguageNeutralSsrPath,
  isLocalizedSsrPath,
  isPrivateSsrPath,
} from "./locale-routing";
import { hasCanonicalLocaleQuery } from "./locale-url";
import {
  markStage,
  markStageIfWaited,
  withoutRequestTiming,
} from "./request-timing";

export { EDGE_CACHE_FRESH_MAX_S, EDGE_CACHE_STALE_S };

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

type CacheState = "HIT" | "STALE" | "KV" | "MISS";

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

function entryAge(hit: Response): number {
  return nowSeconds() - Number(hit.headers.get(STORED_AT) ?? 0);
}

function entryState(hit: Response): "HIT" | "STALE" | "EXPIRED" {
  const age = entryAge(hit);
  const fresh = Number(hit.headers.get(FRESH) ?? 0);
  if (age <= fresh) return "HIT";
  if (age <= fresh + EDGE_CACHE_STALE_S) return "STALE";
  return "EXPIRED";
}

/** A render outside the cache ends the `ssr` stage, omitted when it waited on nothing. */
async function renderStaged(
  render: () => Promise<Response>
): Promise<Response> {
  const response = await render();
  markStageIfWaited("ssr");
  return response;
}

/** Keys with a background revalidation in flight in this isolate. */
const revalidating = new Set<string>();

/** One Workers Logs line per document served through the cache. */
function logServed(
  key: Request,
  state: CacheState,
  age: number | null,
  global: boolean
): void {
  const url = new URL(key.url);
  const lang = url.searchParams.get("lang") ?? url.searchParams.get("__l");
  console.log({
    event: "html-cache",
    state,
    path: url.pathname,
    lang,
    age,
    global,
  });
}

/**
 * Match policy shared by both entry points. `declaredFresh` returns the
 * seconds a render counts as fresh, or 0 when it must not be stored. A
 * `globalCache` serves keys `isGloballyCachedKey` admits from KV when this
 * colo holds no usable copy.
 */
async function serveThroughCache(
  cache: Cache,
  key: Request,
  ctx: WaitUntil,
  render: () => Promise<Response>,
  declaredFresh: (response: Response) => number,
  globalCache: GlobalHtmlCache | null
): Promise<Response> {
  const shared = globalCache && isGloballyCachedKey(key) ? globalCache : null;
  const freshFor = (response: Response) =>
    Math.min(declaredFresh(response), EDGE_CACHE_FRESH_MAX_S);
  const served = (entry: Response, state: CacheState) => {
    logServed(key, state, entryAge(entry), shared !== null);
    return toClient(entry, state);
  };
  const settle = async (work: Promise<unknown>) => {
    const safe = work.catch(() => undefined);
    if (ctx?.waitUntil) ctx.waitUntil(safe);
    else await safe;
  };
  // KV is written only once its copy is GLOBAL_WRITE_INTERVAL_S old, which
  // bounds writes per key whatever the number of colos rendering.
  const store = (response: Response, fresh: number, copy: Response | null) => {
    const stored = toStored(response, fresh);
    const forGlobal =
      shared && (!copy || entryAge(copy) >= GLOBAL_WRITE_INTERVAL_S)
        ? stored.clone()
        : null;
    return Promise.all([
      cache.put(key, stored).catch(() => undefined),
      forGlobal && shared?.put(key, forGlobal, fresh),
    ]);
  };
  // `copy` undefined: KV not read yet. Null: read, nothing usable.
  const revalidate = (copy?: Response | null) => {
    if (!ctx?.waitUntil || revalidating.has(key.url)) return;
    revalidating.add(key.url);
    // The work outlives this response, so its marks must not land in this
    // request's Server-Timing.
    ctx.waitUntil(
      withoutRequestTiming(async () => {
        try {
          const known =
            copy !== undefined ? copy : shared ? await shared.get(key) : null;
          // Another colo already refreshed it; keep its stored-at so the
          // copy expires on the render's clock, not this colo's.
          if (known && entryState(known) === "HIT") {
            return await cache.put(key, known);
          }
          const response = await render();
          const fresh = freshFor(response);
          if (fresh > 0) await store(response, fresh, known);
        } catch {
          // The stale entry stays; the next stale hit retries.
        } finally {
          revalidating.delete(key.url);
        }
      })
    );
  };

  const hit = await cache.match(key).catch(() => undefined);
  const local = hit ? entryState(hit) : "EXPIRED";
  if (hit && local === "HIT") {
    markStage("cache");
    return served(hit, "HIT");
  }
  if (hit && local === "STALE") {
    markStage("cache");
    // Without waitUntil nothing can outlive the response, so serve as a hit.
    if (!ctx?.waitUntil) return served(hit, "HIT");
    revalidate();
    return served(hit, "STALE");
  }

  const copy = shared ? await shared.get(key) : null;
  markStage("cache");
  const remote = copy ? entryState(copy) : "EXPIRED";
  if (copy && remote !== "EXPIRED") {
    await settle(cache.put(key, copy.clone()));
    if (remote === "STALE") revalidate(copy);
    return served(copy, "KV");
  }

  const response = await render();
  markStageIfWaited("ssr");
  logServed(key, "MISS", null, shared !== null);
  const fresh = freshFor(response);
  if (fresh <= 0) return response;
  await settle(store(response, fresh, copy));
  return stamp(response, "MISS");
}

/**
 * Serve `render()` through the edge cache when the request qualifies. `render`
 * must return the final, policy-stamped response (`withSsrLocaleResponse`).
 */
export async function cachedSsrResponse(
  request: Request,
  ctx: WaitUntil,
  render: () => Promise<Response>,
  globalCache: GlobalHtmlCache | null = null
): Promise<Response> {
  const cache = edgeCache();
  const key = cache ? edgeCacheKey(request) : null;
  if (!(cache && key)) return renderStaged(render);
  return serveThroughCache(cache, key, ctx, render, sharedMaxAge, globalCache);
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
  render: () => Promise<Response>,
  globalCache: GlobalHtmlCache | null = null
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
  return serveThroughCache(
    cache,
    key,
    ctx,
    render,
    (response) =>
      response.status !== 200 || response.headers.has("set-cookie") ? 0 : fresh,
    globalCache
  );
}
