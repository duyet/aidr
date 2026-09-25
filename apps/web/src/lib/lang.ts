import type { Lang } from "./types";

export const DEFAULT_LANG: Lang = "vi";
export const LOCALE_QUERY_PARAM = "lang";
export const LEGACY_LOCALE_QUERY_PARAM = "locale";

export const LANG_COOKIE = "news_lang";

/** Server/client-safe serialization for a validated language preference. */
export function langCookieHeader(lang: Lang): string {
  return `${LANG_COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function isLang(value: unknown): value is Lang {
  return value === "vi" || value === "en";
}

/** Exact cookie parsing: `news_lang=enigma` must not select English. */
export function langFromCookie(cookieHeader: string | null): Lang | null {
  for (const part of cookieHeader?.split(";") ?? []) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== LANG_COOKIE) continue;
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

/** Unambiguous valid locale value, or null. Use resolveLocale for request policy. */
export function langFromQuery(search: string | URLSearchParams): Lang | null {
  const resolution = resolveLocale({ search });
  return resolution.ok && resolution.explicit ? resolution.lang : null;
}

/** Highest-quality supported Accept-Language range, or null. */
export function langFromAcceptLanguage(header: string | null): Lang | null {
  const candidates = (header ?? "")
    .split(",")
    .map((part, index) => {
      const [rawTag, ...params] = part.trim().split(";");
      const qParam = params.find((param) =>
        param.trim().toLowerCase().startsWith("q=")
      );
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

export type LocaleErrorCode =
  | "invalid_locale"
  | "repeated_locale"
  | "conflicting_locale";

export type LocaleResolution =
  | {
      ok: true;
      lang: Lang;
      explicit: boolean;
      legacy: boolean;
      source: "lang" | "locale" | "cookie" | "accept-language" | "default";
    }
  | { ok: false; code: LocaleErrorCode; message: string };

/** Locale selected when there is no valid explicit locale parameter. */
export function fallbackLang({
  cookie = null,
  acceptLanguage = null,
}: Omit<LocaleSources, "search"> = {}): Lang {
  return (
    langFromCookie(cookie) ??
    langFromAcceptLanguage(acceptLanguage) ??
    DEFAULT_LANG
  );
}

/**
 * Shared request policy. One exact `lang` is canonical; one exact legacy
 * `locale` is redirectable. Invalid, repeated, and conflicting values are
 * rejected instead of selecting a locale based on order or headers.
 */
export function resolveLocale({
  search = "",
  cookie = null,
  acceptLanguage = null,
}: LocaleSources = {}): LocaleResolution {
  const params = queryParams(search);
  const langValues = params.getAll(LOCALE_QUERY_PARAM);
  const localeValues = params.getAll(LEGACY_LOCALE_QUERY_PARAM);

  if (langValues.length > 1 || localeValues.length > 1) {
    return {
      ok: false,
      code: "repeated_locale",
      message: "Repeated locale parameters are not allowed.",
    };
  }
  if (langValues.length > 0 && localeValues.length > 0) {
    return {
      ok: false,
      code: "conflicting_locale",
      message: "Do not combine lang and locale parameters.",
    };
  }

  const explicit = langValues[0] ?? localeValues[0];
  if (explicit !== undefined) {
    if (!isLang(explicit)) {
      return {
        ok: false,
        code: "invalid_locale",
        message: "Locale must be exactly vi or en.",
      };
    }
    const legacy = localeValues.length === 1;
    return {
      ok: true,
      lang: explicit,
      explicit: true,
      legacy,
      source: legacy ? "locale" : "lang",
    };
  }

  const cookieLang = langFromCookie(cookie);
  if (cookieLang) {
    return {
      ok: true,
      lang: cookieLang,
      explicit: false,
      legacy: false,
      source: "cookie",
    };
  }
  const acceptedLang = langFromAcceptLanguage(acceptLanguage);
  if (acceptedLang) {
    return {
      ok: true,
      lang: acceptedLang,
      explicit: false,
      legacy: false,
      source: "accept-language",
    };
  }
  return {
    ok: true,
    lang: DEFAULT_LANG,
    explicit: false,
    legacy: false,
    source: "default",
  };
}

export function getClientLang(): Lang {
  if (typeof document === "undefined") return "vi";
  return readLangFromCookie(document.cookie);
}

export function setClientLang(lang: Lang) {
  if (typeof document === "undefined") return;
  // Cookie Store API is not available on all browsers we still support.
  // biome-ignore lint/suspicious/noDocumentCookie: lang preference cookie
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  try {
    localStorage.setItem(LANG_COOKIE, lang);
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
