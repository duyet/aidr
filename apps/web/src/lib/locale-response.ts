import {
  fallbackLang,
  type LocaleResolution,
  langCookieHeader,
  resolveLocale,
} from "./lang";
import {
  isLanguageNeutralSsrPath,
  isLocalizedSsrPath,
  isPrivateSsrPath,
} from "./locale-routing";
import {
  canonicalLocaleRedirect,
  hasCanonicalLocaleQuery,
  hasLocaleQuery,
  neutralLocaleRedirect,
} from "./locale-url";
import { NOINDEX_NOFOLLOW_ROBOTS } from "./route-indexability";
import { isServerFnRequest } from "./server-fn-request";
import type { Lang } from "./types";

export const SSR_LOCALIZED_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
export const SSR_NEUTRAL_CACHE_CONTROL =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=3600";
export const LOCALE_PRIVATE_CACHE_CONTROL = "private, no-store";
export const LOCALE_VARY = "Cookie, Accept-Language";
export const LOCALE_REDIRECT_STATUS = 307;
/**
 * Status for a locale redirect that will never be undone. Only legacy story
 * permutations (`/{category}/{slug}`, over-long id hashes) qualify: they resolve
 * to the documented canonical `/{8-hex}`, which is the permanent address, so
 * crawlers can consolidate ranking signals and crawl budget onto it. Locale
 * alias normalization (`locale=` → `lang=`) and every header/cookie-selected hop
 * stays temporary, because its target depends on the requester.
 */
export const PERMANENT_LOCALE_REDIRECT_STATUS = 308;

function appendVary(headers: Headers, value: string): void {
  const current = headers.get("Vary");
  if (!current) {
    headers.set("Vary", value);
    return;
  }
  const present = new Set(
    current
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
  );
  for (const part of value.split(",")) present.add(part.trim().toLowerCase());
  headers.set("Vary", [...present].join(", "));
}

function fallbackForRequest(request: Request): Lang {
  return fallbackLang({
    cookie: request.headers.get("cookie"),
    acceptLanguage: request.headers.get("accept-language"),
  });
}

export function resolveRequestLocale(request: Request): LocaleResolution {
  return resolveLocale({
    search: new URL(request.url).search,
    cookie: request.headers.get("cookie"),
    acceptLanguage: request.headers.get("accept-language"),
  });
}

/**
 * One redirect shape for every locale hop. Only the status differs between the
 * temporary and permanent forms, so the private/varied/noindex policy cannot
 * drift between them: a permanent redirect whose target depends on the
 * requester's cookie or `Accept-Language` must not become shared-cacheable.
 */
function localeRedirect(
  request: Request,
  target: URL | string,
  lang: Lang,
  status: number
): Response {
  const location = new URL(target, request.url);
  const headers = new Headers({
    "Cache-Control": LOCALE_PRIVATE_CACHE_CONTROL,
    "Content-Language": lang,
    Location: location.toString(),
    Vary: LOCALE_VARY,
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": NOINDEX_NOFOLLOW_ROBOTS,
  });
  return new Response(null, { status, headers });
}

export function temporaryLocaleRedirect(
  request: Request,
  target: URL | string,
  lang: Lang
): Response {
  return localeRedirect(request, target, lang, LOCALE_REDIRECT_STATUS);
}

/** Permanent (308) locale hop; see {@link PERMANENT_LOCALE_REDIRECT_STATUS}. */
export function permanentLocaleRedirect(
  request: Request,
  target: URL | string,
  lang: Lang
): Response {
  return localeRedirect(
    request,
    target,
    lang,
    PERMANENT_LOCALE_REDIRECT_STATUS
  );
}

export const API_CONTENT_LANGUAGE = "en, vi";

export function apiErrorResponse(
  status: number,
  payload: { error: string; message: string; message_vi?: string }
): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": LOCALE_PRIVATE_CACHE_CONTROL,
      "Content-Language": API_CONTENT_LANGUAGE,
      Vary: LOCALE_VARY,
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": NOINDEX_NOFOLLOW_ROBOTS,
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function localeErrorResponse(
  _request: Request,
  error: Extract<LocaleResolution, { ok: false }>,
  format: "html" | "json"
): Response {
  if (format === "json") {
    return apiErrorResponse(400, {
      error: error.code,
      message: error.message,
      message_vi: "Tham số locale không hợp lệ hoặc bị lặp/xung đột.",
    });
  }
  const headers = new Headers({
    "Cache-Control": LOCALE_PRIVATE_CACHE_CONTROL,
    "Content-Language": API_CONTENT_LANGUAGE,
    "Content-Type": "text/html; charset=utf-8",
    Vary: LOCALE_VARY,
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": NOINDEX_NOFOLLOW_ROBOTS,
  });
  const body = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Invalid locale</title><body><h1>Yêu cầu locale không hợp lệ / Invalid locale request</h1><p>${escapeHtml(error.message)}</p></body></html>`;
  return new Response(body, { status: 400, headers });
}

export type ApiLocaleResolution =
  | { ok: true; locale: Extract<LocaleResolution, { ok: true }> }
  | { ok: false; response: Response };

/** Shared alias/error gate for JSON and localized representation endpoints. */
export function resolveApiRequestLocale(request: Request): ApiLocaleResolution {
  const normalized = normalizeLocaleRequest(request, { format: "json" });
  if (normalized) return { ok: false, response: normalized };
  const locale = resolveRequestLocale(request);
  return locale.ok
    ? { ok: true, locale }
    : { ok: false, response: localeErrorResponse(request, locale, "json") };
}

/**
 * Validate UI/API locale parameters before route handling. One legacy value
 * gets a temporary canonical redirect; invalid/repeated/conflicting values
 * fail with 400. Missing values continue to cookie/Accept-Language/default.
 */
export function normalizeLocaleRequest(
  request: Request,
  options: {
    format: "html" | "json";
    neutralPath?: boolean;
    redirectPath?: string;
  } = {
    format: "json",
  }
): Response | null {
  const resolution = resolveRequestLocale(request);
  if (!resolution.ok) {
    return localeErrorResponse(request, resolution, options.format);
  }

  const url = new URL(request.url);
  if (options.neutralPath && hasLocaleQuery(url.search)) {
    const href = neutralLocaleRedirect(url.pathname, url.search, url.hash);
    if (href) {
      const response = temporaryLocaleRedirect(request, href, "en");
      if (resolution.explicit) {
        response.headers.append(
          "Set-Cookie",
          langCookieHeader(resolution.lang)
        );
      }
      return response;
    }
  }
  if (resolution.legacy) {
    const href = canonicalLocaleRedirect(
      options.redirectPath ?? url.pathname,
      url.search,
      url.hash,
      resolution.lang
    );
    if (href) return temporaryLocaleRedirect(request, href, resolution.lang);
  }
  return null;
}

/**
 * Server functions are same-origin RPC, not documents. The locale is still
 * validated, but a bad value must be reported in a shape the Start client can
 * deserialize: an HTML error page or a 307 makes the client rethrow the raw
 * `error` string (or a plain object), which the submit form cannot explain.
 * A legacy `locale` alias is simply ignored here instead of redirecting — the
 * result of a submit call does not depend on the query value.
 */
export function resolveServerFnLocaleRequest(
  request: Request
): Response | null {
  const resolution = resolveRequestLocale(request);
  if (!resolution.ok) {
    return apiErrorResponse(400, {
      error: resolution.code,
      message: resolution.message,
      message_vi: "Tham số locale không hợp lệ hoặc bị lặp/xung đột.",
    });
  }
  return null;
}

function setSafePublicPolicy(headers: Headers, publicControl: string): void {
  const existing = headers.get("Cache-Control")?.toLowerCase() ?? "";
  if (!existing.includes("private") && !existing.includes("no-store")) {
    headers.set("Cache-Control", publicControl);
  }
}

/** Final response policy for every TanStack SSR/UI response. */
export function withSsrLocaleResponse(
  request: Request,
  response: Response
): Response {
  const url = new URL(request.url);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return response;
  }
  // Start owns the server-function response: its body may be a framed
  // stream, and its serialized-error status is the client contract. Do not
  // re-wrap it or stamp document cache/locale policy onto it.
  if (isServerFnRequest(request)) {
    return response;
  }
  const resolution = resolveRequestLocale(request);
  const lang = resolution.ok ? resolution.lang : fallbackForRequest(request);
  const privateRoute = isPrivateSsrPath(url.pathname, url.search);
  const neutral = isLanguageNeutralSsrPath(url.pathname);
  const localized = isLocalizedSsrPath(url.pathname);
  const contentLanguage = neutral ? "en" : lang;
  const headers = new Headers(response.headers);

  if (response.status >= 300) {
    headers.set("Cache-Control", LOCALE_PRIVATE_CACHE_CONTROL);
    headers.set("Content-Language", contentLanguage);
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", NOINDEX_NOFOLLOW_ROBOTS);
    appendVary(headers, LOCALE_VARY);
  } else if (response.status >= 400) {
    headers.set("Cache-Control", LOCALE_PRIVATE_CACHE_CONTROL);
    headers.set("Content-Language", contentLanguage);
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", NOINDEX_NOFOLLOW_ROBOTS);
    appendVary(headers, LOCALE_VARY);
  } else if (privateRoute) {
    headers.set("Cache-Control", LOCALE_PRIVATE_CACHE_CONTROL);
    headers.set("Content-Language", contentLanguage);
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", NOINDEX_NOFOLLOW_ROBOTS);
    appendVary(headers, LOCALE_VARY);
  } else if (neutral) {
    headers.set("Content-Language", "en");
    setSafePublicPolicy(headers, SSR_NEUTRAL_CACHE_CONTROL);
    // The rendered navigation links can use the request-resolved locale even
    // when this particular request has no Cookie or Accept-Language header.
    // Vary the first key as well as header-selected responses so a shared
    // cache cannot reuse default-language links for another user's locale.
    appendVary(headers, LOCALE_VARY);
  } else if (localized) {
    headers.set("Content-Language", lang);
    if (hasCanonicalLocaleQuery(url.search)) {
      setSafePublicPolicy(headers, SSR_LOCALIZED_CACHE_CONTROL);
    } else {
      // Private + varied is a cache-isolation requirement, not a robots one.
      // Indexability for this response is owned by `routeIndexability` alone:
      // `withRouteIndexabilityHeaders` already stamped X-Robots-Tag on the way
      // in, and the same function feeds `<meta name="robots">` via
      // `routeRobotsMeta` (seo.ts), so the header and the meta cannot disagree.
      // A bare `/{8-hex}` or `/` is therefore indexable, and dedup rides on the
      // self-referencing `?lang=` canonical + hreflang pair that
      // `localizedHeadLinks` already emits. A second opinion here used to force
      // `noindex, follow` and put 1,005 discovered URLs into GSC's
      // "Discovered - currently not indexed" bucket (issue #223).
      headers.set("Cache-Control", LOCALE_PRIVATE_CACHE_CONTROL);
      appendVary(headers, LOCALE_VARY);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export { appendVary };
