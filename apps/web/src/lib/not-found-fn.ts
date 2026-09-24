import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { readLangFromCookie, resolveLang } from "./lang";
import type { Lang } from "./types";

/** news_lang cookie (VI default). Unit-testable without Start. */
export function notFoundLangFromCookie(cookieHeader: string | null): Lang {
  return readLangFromCookie(cookieHeader);
}

/**
 * Request locale for SSR and client navigation. Server imports stay inside
 * createIsomorphicFn.server() so the client graph stays clean.
 */
export const loadNotFoundLang = createIsomorphicFn()
  .client(
    (search = ""): Lang =>
      resolveLang({
        search,
        cookie: typeof document === "undefined" ? null : document.cookie,
        acceptLanguage:
          typeof navigator === "undefined"
            ? null
            : (navigator.languages?.join(",") ?? navigator.language),
      })
  )
  .server(
    (search = ""): Lang =>
      resolveLang({
        search,
        cookie: getRequestHeader("cookie") ?? null,
        acceptLanguage: getRequestHeader("accept-language") ?? null,
      })
  );
