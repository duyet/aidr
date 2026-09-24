import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import {
  type LocaleResolution,
  readLangFromCookie,
  resolveLocale,
} from "./lang";
import type { Lang } from "./types";

/** news_lang cookie (VI default). Unit-testable without Start. */
export function notFoundLangFromCookie(cookieHeader: string | null): Lang {
  return readLangFromCookie(cookieHeader);
}

/** Shared request resolver used by root SSR and client navigation. */
export const loadRequestLocale = createIsomorphicFn()
  .client(
    (search = ""): LocaleResolution =>
      resolveLocale({
        search,
        cookie: typeof document === "undefined" ? null : document.cookie,
        acceptLanguage:
          typeof navigator === "undefined"
            ? null
            : (navigator.languages?.join(",") ?? navigator.language),
      })
  )
  .server(
    (search = ""): LocaleResolution =>
      resolveLocale({
        search,
        cookie: getRequestHeader("cookie") ?? null,
        acceptLanguage: getRequestHeader("accept-language") ?? null,
      })
  );
