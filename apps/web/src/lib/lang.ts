import type { Lang } from "./types";

export const DEFAULT_LANG: Lang = "vi";
export const LOCALE_QUERY_PARAM = "lang";
export const LEGACY_LOCALE_QUERY_PARAM = "locale";

const COOKIE = "news_lang";

export function isLang(value: unknown): value is Lang {
  return value === "vi" || value === "en";
}

/** Exact cookie parsing: `news_lang=enigma` must not select English. */
export function langFromCookie(cookieHeader: string | null): Lang | null {
  for (const part of cookieHeader?.split(";") ?? []) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== COOKIE) continue;
    const value = rawValue.join("=").trim();
    return isLang(value) ? value : null;
  }
  return null;
}

export function readLangFromCookie(cookieHeader: string | null): Lang {
  // Default to Vietnamese when no explicit choice was made.
  return langFromCookie(cookieHeader) ?? DEFAULT_LANG;
}

function queryParams(search: string | URLSearchParams): URLSearchParams {
  if (search instanceof URLSearchParams) return search;
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function firstParam(params: URLSearchParams, name: string): string | undefined {
  return params.getAll(name)[0];
}

/**
 * Read the first canonical `lang` value. Repeated/conflicting parameters are
 * deterministic: the first value wins and is never replaced by a later one.
 */
export function langFromQuery(search: string | URLSearchParams): Lang | null {
  const params = queryParams(search);
  const lang = firstParam(params, LOCALE_QUERY_PARAM);
  if (lang !== undefined) return isLang(lang) ? lang : null;
  const locale = firstParam(params, LEGACY_LOCALE_QUERY_PARAM);
  return isLang(locale) ? locale : null;
}

/** Highest-quality supported Accept-Language range, or null. */
export function langFromAcceptLanguage(header: string | null): Lang | null {
  const candidates = (header ?? "")
    .split(",")
    .map((part, index) => {
      const [rawTag, ...params] = part.trim().split(";");
      const qParam = params.find((param) => param.trim().startsWith("q="));
      const parsedQ = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      const q = Number.isFinite(parsedQ)
        ? Math.min(1, Math.max(0, parsedQ))
        : 0;
      const tag = rawTag.trim().toLowerCase().split("-")[0];
      return { lang: isLang(tag) ? tag : null, q, index };
    })
    .filter((candidate) => candidate.lang !== null && candidate.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return (candidates[0]?.lang as Lang | undefined) ?? null;
}

export interface LocaleSources {
  search?: string | URLSearchParams;
  cookie?: string | null;
  acceptLanguage?: string | null;
}

/**
 * Request locale contract: canonical `lang`, legacy `locale`, persisted
 * `news_lang`, Accept-Language, then Vietnamese. Unsupported explicit values
 * are ignored and fall through to the same safe defaults.
 */
export function resolveLang({
  search = "",
  cookie = null,
  acceptLanguage = null,
}: LocaleSources): Lang {
  const params = queryParams(search);
  const canonical = firstParam(params, LOCALE_QUERY_PARAM);
  if (canonical !== undefined) {
    return isLang(canonical)
      ? canonical
      : resolveLangWithoutQuery(cookie, acceptLanguage);
  }
  const legacy = firstParam(params, LEGACY_LOCALE_QUERY_PARAM);
  if (legacy !== undefined) {
    return isLang(legacy)
      ? legacy
      : resolveLangWithoutQuery(cookie, acceptLanguage);
  }
  return resolveLangWithoutQuery(cookie, acceptLanguage);
}

function resolveLangWithoutQuery(
  cookie: string | null,
  acceptLanguage: string | null
): Lang {
  return (
    langFromCookie(cookie) ??
    langFromAcceptLanguage(acceptLanguage) ??
    DEFAULT_LANG
  );
}

export function getClientLang(): Lang {
  if (typeof document === "undefined") return "vi";
  return readLangFromCookie(document.cookie);
}

export function setClientLang(lang: Lang) {
  if (typeof document === "undefined") return;
  // Cookie Store API is not available on all browsers we still support.
  // biome-ignore lint/suspicious/noDocumentCookie: lang preference cookie
  document.cookie = `${COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  try {
    localStorage.setItem(COOKIE, lang);
  } catch {
    // localStorage unavailable (private mode) — cookie is enough
  }
}

export function timeAgo(
  epochSec: number,
  now = Date.now(),
  lang: Lang = "en"
): string {
  const normalizeTs = (v: number) =>
    v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
  const started = normalizeTs(epochSec);
  const diff = Math.max(0, Math.floor(now / 1000) - started);
  if (lang === "vi") {
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    return `${Math.floor(diff / 86400)} ngày trước`;
  }
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const CATEGORY_LABELS_VI: Record<string, string> = {
  Regulation: "Chính sách",
  Research: "Nghiên cứu",
  Releases: "Phát hành",
  Funding: "Gọi vốn",
  Legal: "Pháp lý",
  Industry: "Doanh nghiệp",
  Products: "Sản phẩm",
  Infra: "Hạ tầng",
};

export function categoryLabel(name: string, lang: Lang): string {
  if (lang !== "vi") return name;
  return CATEGORY_LABELS_VI[name] ?? name;
}

const STATUS_LABELS_VI: Record<string, string> = {
  new: "Mới",
  published: "Đã đăng",
  rejected: "Từ chối",
  pending: "Đang chờ",
  accepted: "Đã duyệt",
};

/** Localizes an items.status value (used by /system's "items by status"
 * chart) — unrecognized statuses fall back to the raw DB value rather than
 * guessing a translation. */
export function statusLabel(name: string, lang: Lang): string {
  if (lang !== "vi") return name;
  return STATUS_LABELS_VI[name] ?? name;
}

export function formatDayHeading(date: string, lang: Lang): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
