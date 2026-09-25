import { isLang, type LocaleErrorCode, type LocaleResolution } from "./lang";
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

/** Keep an explicit locale on internal navigations that replace child search. */
export function preserveRootLang(
  current: RootSearch,
  next: RootSearch
): RootSearch {
  if (next.lang || !current.lang) return next;
  return { ...next, lang: current.lang };
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
