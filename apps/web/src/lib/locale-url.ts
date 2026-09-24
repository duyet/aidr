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

/**
 * Redirect only URLs carrying a locale parameter. Bare legacy URLs keep
 * working (and cookie/Accept-Language selection) but are not edge-cacheable.
 */
export function canonicalLocaleRedirect(
  pathname: string,
  search: string,
  hash: string,
  lang: Lang
): string | null {
  if (!hasLocaleQuery(search) || hasCanonicalLocaleQuery(search)) return null;
  return `${pathname}${normalizedLocaleSearch(search, lang)}${hash}`;
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
