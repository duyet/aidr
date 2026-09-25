import {
  isLang,
  LEGACY_LOCALE_QUERY_PARAM,
  LOCALE_QUERY_PARAM,
  type LocaleErrorCode,
  type LocaleResolution,
  setClientLang,
} from "./lang";
import type { Lang } from "./types";

export interface RootSearch {
  lang?: Lang;
  /** Parsed only long enough to redirect compatibility URLs to `lang`. */
  locale?: string;
}

function firstSearchValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstSearchValue(value[0]);
  return typeof value === "string" ? value : undefined;
}

export function validateRootSearch(
  search: Record<string, unknown>
): RootSearch {
  const lang = firstSearchValue(search.lang);
  const locale = firstSearchValue(search.locale);
  return {
    ...(isLang(lang) ? { lang } : {}),
    ...(locale !== undefined ? { locale } : {}),
  };
}

interface RootSearchMeta {
  removedAny?: ReadonlySet<string>;
  explicit?: unknown;
}

function explicitLocale(value: unknown): Lang | null {
  if (!value || typeof value !== "object") return null;
  const search = value as Record<string, unknown>;
  if (isLang(search.lang)) return search.lang;
  if (isLang(search.locale)) return search.locale;
  return null;
}

/**
 * Keep an explicit locale on internal navigations that replace child search.
 *
 * Neutral public routes strip locale parameters in their child middleware. The
 * strip metadata is the signal not to put the locale back in the root search;
 * otherwise a neutral route would immediately redirect back to itself forever.
 * Persisting the current explicit choice before stripping keeps the selected
 * language available to links rendered by the neutral page.
 */
export function preserveRootLang<T extends object>(
  current: RootSearch,
  next: T,
  meta?: RootSearchMeta
): T {
  const localeWasStripped =
    meta?.removedAny?.has(LOCALE_QUERY_PARAM) === true ||
    meta?.removedAny?.has(LEGACY_LOCALE_QUERY_PARAM) === true;
  if (localeWasStripped) {
    const explicit = explicitLocale(meta?.explicit) ?? explicitLocale(current);
    if (explicit) setClientLang(explicit);
    return next;
  }
  if (("lang" in next && next.lang) || !current.lang) return next;
  return { ...next, lang: current.lang } as T;
}

/** Run the root locale rule with TanStack's downstream search metadata. */
export function preserveRootLangFromMiddleware<T extends object>(
  current: T,
  next: (search: T) => T
): T {
  const nextWithMeta = next as unknown as (
    value: T,
    collectMeta: true
  ) => { search: T; meta?: RootSearchMeta };
  const { search: nextSearch, meta } = nextWithMeta(current, true);
  return preserveRootLang(current as RootSearch, nextSearch, meta);
}

export class InvalidLocaleRequestError extends Error {
  readonly statusCode = 400;
  readonly code: LocaleErrorCode;

  constructor(resolution: Extract<LocaleResolution, { ok: false }>) {
    super(resolution.message);
    this.name = "InvalidLocaleRequestError";
    this.code = resolution.code;
  }
}

const NEUTRAL_SSR_PATHS = new Set([
  "/about",
  "/brand",
  "/data",
  "/mail",
  "/privacy",
  "/terms",
]);

const PRIVATE_NEUTRAL_SSR_PREFIXES = ["/sign-in", "/sign-up"];

const LOCALIZED_SSR_PATHS = new Set([
  "/",
  "/changelog",
  "/mcp",
  "/submit",
  "/subscribe",
]);

function normalizedPath(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

function isPathOrChild(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function isLanguageNeutralSsrPath(pathname: string): boolean {
  const path = normalizedPath(pathname);
  return (
    NEUTRAL_SSR_PATHS.has(path) ||
    PRIVATE_NEUTRAL_SSR_PREFIXES.some((root) => isPathOrChild(path, root))
  );
}

/** User-specific/authenticated surfaces must never become edge-cacheable. */
export function isPrivateSsrPath(pathname: string, search = ""): boolean {
  const path = normalizedPath(pathname);
  if (
    path === "/mail" ||
    PRIVATE_NEUTRAL_SSR_PREFIXES.some((root) => isPathOrChild(path, root))
  ) {
    return true;
  }
  if (path === "/subscribe") {
    const params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search
    );
    return params.has("unsubscribe") || params.has("settings");
  }
  return false;
}

export function isLocaleAwareApiPath(pathname: string): boolean {
  return /^\/api\/(?:public|feed(?:\/freshness)?|story\/[^/]+|subscribe\/preview|extension)\/?$/.test(
    pathname
  );
}

export function isLocalizedSsrPath(pathname: string): boolean {
  const path = normalizedPath(pathname);
  if (LOCALIZED_SSR_PATHS.has(path)) return true;
  if (!path.startsWith("/") || path.slice(1).includes("/")) return false;
  const slug = path.slice(1);
  return /^[0-9a-f]{8,64}$/.test(slug) || /-[0-9a-f]{8,64}$/.test(slug);
}
