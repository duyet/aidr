import { SAFE_PARAMS, sanitizeUrl } from "./analytics/url-privacy";
import { withLang } from "./locale-url";
import type { Lang } from "./types";

const PROBE_ORIGIN = "https://return.invalid";
const AUTH_PATHS = ["/sign-in", "/sign-up"];

/**
 * `returnTo` as a path on this site, or null. Resolving against a probe
 * origin rejects anything a browser would send elsewhere: `//host`,
 * `/\host`, `https://host`, `javascript:`. Auth routes are rejected too, so
 * sign-in never returns to itself. The path goes to Clerk, so only
 * SAFE_PARAMS survive (a mailed subscriber token must not) and the hash is
 * dropped, which the server never sees and so could not render.
 */
export function sameOriginReturnPath(returnTo: string): string | null {
  let url: URL;
  try {
    url = new URL(returnTo, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  const path = url.pathname;
  if (AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return null;
  }
  const back = sanitizeUrl(url.href, SAFE_PARAMS).slice(PROBE_ORIGIN.length);
  // Dot segments collapse during parsing, so `/..//host` comes out as
  // `//host`. Check the path a browser will read, not the one written.
  if (new URL(back, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return null;
  return back;
}

/**
 * /sign-in carrying Clerk's `redirect_url`. Clerk ranks it above the
 * provider's `signInFallbackRedirectUrl` (the homepage), so the reader lands
 * back on `returnTo` after signing in.
 */
export function signInHref(lang: Lang, returnTo: string): string {
  const href = withLang("/sign-in", lang);
  const back = sameOriginReturnPath(returnTo);
  if (!back) return href;
  const url = new URL(href, PROBE_ORIGIN);
  url.searchParams.set("redirect_url", back);
  return `${url.pathname}${url.search}`;
}
