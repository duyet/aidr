import { isLang } from "./lang";
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
