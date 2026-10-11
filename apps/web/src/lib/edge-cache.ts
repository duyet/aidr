/**
 * Workers Cache API in front of SSR. A Worker response is not stored by the
 * CDN on its own, so without this every distinct query string re-renders the
 * page. The key drops tracking params so extension/newsletter/social clicks
 * share one entry with the clean URL.
 *
 * Only public, locale-keyed HTML is stored: never `private`/`no-store`, never
 * a response with `Set-Cookie`, never a non-200, never a request carrying
 * auth. Locale policy itself stays in `locale-response.ts`.
 */
import { resolveLocale } from "./lang";
import {
  isLanguageNeutralSsrPath,
  isLocalizedSsrPath,
  isPrivateSsrPath,
} from "./locale-routing";
import { hasCanonicalLocaleQuery } from "./locale-url";

export const EDGE_CACHE_HEADER = "x-aidr-cache";
/** Bump to orphan every stored page after a markup-shape change. */
const EDGE_CACHE_VERSION = "1";

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
    !(isLocalizedSsrPath(url.pathname) && hasCanonicalLocaleQuery(url.search))
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

function stamp(response: Response, state: "HIT" | "MISS"): Response {
  // Cached and freshly built responses may have immutable headers.
  const out = new Response(response.body, response);
  out.headers.set(EDGE_CACHE_HEADER, state);
  return out;
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
  if (!(cache && key)) return render();

  const hit = await cache.match(key).catch(() => undefined);
  if (hit) return stamp(hit, "HIT");

  const response = await render();
  if (sharedMaxAge(response) <= 0) return response;

  // The stored copy must not vary: the key already carries the locale, and
  // the Cache API would otherwise refuse to match on a different Cookie.
  const stored = new Response(response.clone().body, response);
  stored.headers.delete("vary");
  const write = cache.put(key, stored).catch(() => undefined);
  if (ctx?.waitUntil) ctx.waitUntil(write);
  else await write;
  return stamp(response, "MISS");
}
