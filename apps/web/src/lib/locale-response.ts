import { fallbackLang, type LocaleResolution, resolveLocale } from "./lang";
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
import type { Lang } from "./types";

export const SSR_LOCALIZED_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
export const SSR_NEUTRAL_CACHE_CONTROL =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=3600";
export const LOCALE_PRIVATE_CACHE_CONTROL = "private, no-store";
export const LOCALE_VARY = "Cookie, Accept-Language";
export const LOCALE_REDIRECT_STATUS = 307;

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

export function temporaryLocaleRedirect(
  request: Request,
  target: URL | string,
  lang: Lang
): Response {
  const location = new URL(target, request.url);
  const headers = new Headers({
    "Cache-Control": LOCALE_PRIVATE_CACHE_CONTROL,
    "Content-Language": lang,
    Location: location.toString(),
    Vary: LOCALE_VARY,
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  });
  return new Response(null, { status: LOCALE_REDIRECT_STATUS, headers });
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
      "X-Robots-Tag": "noindex, nofollow",
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
    "X-Robots-Tag": "noindex, nofollow",
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
  options: { format: "html" | "json"; neutralPath?: boolean } = {
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
    if (href) return temporaryLocaleRedirect(request, href, "en");
  }
  if (resolution.legacy) {
    const href = canonicalLocaleRedirect(
      url.pathname,
      url.search,
      url.hash,
      resolution.lang
    );
    if (href) return temporaryLocaleRedirect(request, href, resolution.lang);
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
  const resolution = resolveRequestLocale(request);
  const lang = resolution.ok ? resolution.lang : fallbackForRequest(request);
  const privateRoute = isPrivateSsrPath(url.pathname, url.search);
  const neutral = isLanguageNeutralSsrPath(url.pathname);
  const localized = isLocalizedSsrPath(url.pathname);
  const headers = new Headers(response.headers);

  if (response.status >= 300) {
    headers.set("Cache-Control", LOCALE_PRIVATE_CACHE_CONTROL);
    headers.set("Content-Language", lang);
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    appendVary(headers, LOCALE_VARY);
  } else if (response.status >= 400) {
    headers.set("Cache-Control", LOCALE_PRIVATE_CACHE_CONTROL);
    headers.set("Content-Language", lang);
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    appendVary(headers, LOCALE_VARY);
  } else if (privateRoute) {
    headers.set("Cache-Control", LOCALE_PRIVATE_CACHE_CONTROL);
    headers.set("Content-Language", lang);
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    appendVary(headers, LOCALE_VARY);
  } else if (neutral) {
    headers.set("Content-Language", "en");
    setSafePublicPolicy(headers, SSR_NEUTRAL_CACHE_CONTROL);
  } else if (localized) {
    headers.set("Content-Language", lang);
    if (hasCanonicalLocaleQuery(url.search)) {
      setSafePublicPolicy(headers, SSR_LOCALIZED_CACHE_CONTROL);
    } else {
      headers.set("Cache-Control", LOCALE_PRIVATE_CACHE_CONTROL);
      headers.set("X-Robots-Tag", "noindex, follow");
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
