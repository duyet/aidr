import { isLang, LEGACY_LOCALE_QUERY_PARAM, LOCALE_QUERY_PARAM } from "./lang";
import { SITE_URL } from "./site";
import type { Lang } from "./types";

const SITE_HOSTS = new Set(["aidr.today", "www.aidr.today"]);

function asParams(search: string | URLSearchParams): URLSearchParams {
  if (search instanceof URLSearchParams) return new URLSearchParams(search);
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function isSiteUrl(value: string): boolean {
  try {
    return SITE_HOSTS.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Add one validated `lang` parameter while preserving every unrelated query. */
export function withLang(url: string, lang: Lang): string {
  try {
    const absolute = isAbsoluteHttpUrl(url);
    const next = new URL(url, `${SITE_URL}/`);
    next.searchParams.delete(LEGACY_LOCALE_QUERY_PARAM);
    next.searchParams.delete(LOCALE_QUERY_PARAM);
    next.searchParams.set(LOCALE_QUERY_PARAM, lang);
    if (absolute) return next.toString();
    return `${next.pathname}${next.search}${next.hash}`;
  } catch {
    return url;
  }
}

/** Localize an aidr.today URL only; publisher/external URLs stay untouched. */
export function withSiteLang(url: string, lang: Lang): string {
  return isSiteUrl(url) ? withLang(url, lang) : url;
}

export function absoluteSiteUrl(path: string, lang: Lang): string {
  return new URL(withLang(path, lang), `${SITE_URL}/`).toString();
}

export function hasCanonicalLocaleQuery(
  search: string | URLSearchParams
): boolean {
  const params = asParams(search);
  const lang = params.getAll(LOCALE_QUERY_PARAM);
  const locale = params.getAll(LEGACY_LOCALE_QUERY_PARAM);
  return lang.length === 1 && locale.length === 0 && isLang(lang[0]);
}

export function hasLocaleQuery(search: string | URLSearchParams): boolean {
  const params = asParams(search);
  return (
    params.getAll(LOCALE_QUERY_PARAM).length > 0 ||
    params.getAll(LEGACY_LOCALE_QUERY_PARAM).length > 0
  );
}

function normalizedLocaleSearch(
  search: string | URLSearchParams,
  lang: Lang
): string {
  const params = asParams(search);
  params.delete(LEGACY_LOCALE_QUERY_PARAM);
  params.delete(LOCALE_QUERY_PARAM);
  params.set(LOCALE_QUERY_PARAM, lang);
  return `?${params.toString()}`;
}

/** One valid legacy `locale` redirects; invalid/repeated values are rejected. */
export function canonicalLocaleRedirect(
  pathname: string,
  search: string,
  hash: string,
  lang: Lang
): string | null {
  const params = asParams(search);
  const langValues = params.getAll(LOCALE_QUERY_PARAM);
  const localeValues = params.getAll(LEGACY_LOCALE_QUERY_PARAM);
  if (
    langValues.length !== 0 ||
    localeValues.length !== 1 ||
    localeValues[0] !== lang
  ) {
    return null;
  }
  return `${pathname}${normalizedLocaleSearch(search, lang)}${hash}`;
}

/** Language-neutral pages canonicalize to their bare path, preserving filters. */
export function neutralLocaleRedirect(
  pathname: string,
  search: string,
  hash: string
): string | null {
  if (!hasLocaleQuery(search)) return null;
  const params = asParams(search);
  params.delete(LEGACY_LOCALE_QUERY_PARAM);
  params.delete(LOCALE_QUERY_PARAM);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

/**
 * `/`, or `/` followed by a character other than `/` or `\`.
 * `//host` is scheme-relative. The WHATWG parser folds `\` into `/` before
 * it resolves the host, so `/\host` is the same open redirect.
 */
function isSingleSlashPath(pathname: string): boolean {
  return (
    pathname.startsWith("/") &&
    (pathname.length === 1 || (pathname[1] !== "/" && pathname[1] !== "\\"))
  );
}

function pathBeforeQuery(value: string): string {
  const hash = value.indexOf("#");
  const noHash = hash === -1 ? value : value.slice(0, hash);
  const query = noHash.indexOf("?");
  return query === -1 ? noHash : noHash.slice(0, query);
}

/**
 * Path of a redirect target before the URL parser can fold `\` into `/`.
 * A `URL` pathname is already folded, so only a string can still contain `\`.
 */
function redirectTargetPathname(target: string | URL): string {
  if (target instanceof URL) return target.pathname;
  const path = pathBeforeQuery(target);
  if (path.startsWith("//") || !/^[a-zA-Z][a-zA-Z+\-.]*:/.test(path)) {
    return path;
  }
  const rest = path.slice(path.indexOf(":") + 1);
  if (!rest.startsWith("//")) return rest.startsWith("/") ? rest : "/";
  const hostAndPath = rest.slice(2);
  const slash = hostAndPath.indexOf("/");
  const backslash = hostAndPath.indexOf("\\");
  const start =
    slash === -1
      ? backslash
      : backslash === -1
        ? slash
        : Math.min(slash, backslash);
  return start === -1 ? "/" : hostAndPath.slice(start);
}

/**
 * Resolve `target` against the request. Null when the path is not a single
 * slash or the result origin is not the request origin — callers must not
 * send a Location in that case.
 */
export function sameOriginRedirectUrl(
  target: string | URL,
  requestUrl: string | URL
): URL | null {
  if (!isSingleSlashPath(redirectTargetPathname(target))) return null;
  try {
    const base = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
    const resolved = new URL(target, base);
    if (resolved.origin !== base.origin) return null;
    if (!isSingleSlashPath(resolved.pathname)) return null;
    return resolved;
  } catch {
    return null;
  }
}

/** Public response caching is safe only with one explicit canonical locale. */
export function localeCacheControl(
  search: string | URLSearchParams,
  publicControl: string
): { cacheControl: string; vary?: string } {
  if (hasCanonicalLocaleQuery(search)) return { cacheControl: publicControl };
  return {
    cacheControl: "private, no-store",
    vary: "Cookie, Accept-Language",
  };
}
