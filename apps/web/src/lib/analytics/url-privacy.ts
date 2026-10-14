/**
 * Page URLs as the analytics vendors may see them.
 *
 * GA4, PostHog and Jitsu read `location.href` themselves, so the whole query
 * string reaches them unless they are handed a clean URL. Only SAFE_PARAMS
 * survive: values our own links set. Everything else is dropped, including
 * free-text search (`q`) and the subscribe tokens (`unsubscribe`,
 * `settings`), which authorize changes to a subscription.
 */

export const SAFE_PARAMS: readonly string[] = [
  "lang",
  "locale",
  "ref",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "tab",
  "freq",
  "tag",
  "category",
  "month",
  "aidr",
];

/**
 * Drops the hash and every query param outside `safe`. Strings that are not
 * absolute URLs come back unchanged. Self-contained, because the head boot
 * script inlines its source.
 */
export function sanitizeUrl(raw: string, safe: readonly string[]): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  const kept = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (safe.indexOf(key) !== -1) kept.append(key, value);
  });
  const search = kept.toString();
  return url.origin + url.pathname + (search ? `?${search}` : "");
}

export type SanitizedPage = {
  url: string;
  path: string;
  search: string;
  referrer: string;
};

export function sanitizedPage(): SanitizedPage {
  const url = sanitizeUrl(window.location.href, SAFE_PARAMS);
  const parsed = new URL(url);
  return {
    url,
    path: parsed.pathname,
    search: parsed.search,
    referrer: sanitizeUrl(window.document.referrer, SAFE_PARAMS),
  };
}

/** GA4's names for the page fields every hit carries. */
export function gaPageFields(): {
  page_location: string;
  page_referrer: string;
} {
  const page = sanitizedPage();
  return { page_location: page.url, page_referrer: page.referrer };
}

/** An absolute or root-relative URL on this site, sanitized; anything else unchanged. */
function sanitizeOwnUrl(raw: string, origin: string): string {
  if (raw.startsWith(origin)) return sanitizeUrl(raw, SAFE_PARAMS);
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return sanitizeUrl(origin + raw, SAFE_PARAMS).slice(origin.length);
  }
  return raw;
}

const ELEMENT_HREF = /href="([^"]*)"/g;

/**
 * PostHog `before_send`. Rewrites every URL on this site anywhere in the
 * event: `$current_url`, `$referrer`, `$session_entry_url`, the `$set_once`
 * initial values, and link hrefs in autocaptured `$elements_chain` and
 * `$elements`. Links to other sites keep their query.
 */
export function scrubPosthogEvent<E>(event: E): E {
  const origin = window.location.origin;
  const visit = (value: unknown, key: string): unknown => {
    if (typeof value === "string") {
      if (key === "$elements_chain") {
        return value.replace(
          ELEMENT_HREF,
          (_match, href: string) => `href="${sanitizeOwnUrl(href, origin)}"`
        );
      }
      return sanitizeOwnUrl(value, origin);
    }
    if (Array.isArray(value)) return value.map((item) => visit(item, key));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = visit(v, k);
      return out;
    }
    return value;
  };
  return visit(event, "") as E;
}

export type SubscribeLink = {
  kind: "unsubscribe" | "settings";
  token: string;
};

const SUBSCRIBE_LINK_GLOBAL = "__aidrSubscribeLink";

/**
 * Runs inline in <head>, after the Cloudflare tag gateway's snippet and
 * before any vendor script executes. Self-contained, because its source is
 * inlined.
 *
 * 1. Moves a subscribe token out of the URL into a window global, so no
 *    vendor ever reads it. Stripping it later is too late: once gtag.js has
 *    loaded, the `replaceState` sends a history page_view whose referrer is
 *    the tokened URL.
 * 2. Gives the gateway's queued `config` a sanitized page_location. A
 *    `gtag('set')` does not reach the page_view of a `config` queued before
 *    it, and the gateway's `config` is the first thing in <head>.
 */
function bootUrlPrivacy(
  sanitize: typeof sanitizeUrl,
  safe: readonly string[],
  linkGlobal: string
): void {
  const w = window as unknown as Record<string, unknown> & {
    dataLayer?: unknown[];
  };
  const url = new URL(location.href);
  if (url.pathname === "/subscribe") {
    for (const kind of ["unsubscribe", "settings"]) {
      const token = url.searchParams.get(kind);
      if (token && !w[linkGlobal]) w[linkGlobal] = { kind, token };
      url.searchParams.delete(kind);
    }
    if (url.href !== location.href) {
      history.replaceState(
        history.state,
        "",
        url.pathname + url.search + url.hash
      );
    }
  }
  const page = {
    page_location: sanitize(location.href, safe),
    page_referrer: sanitize(document.referrer, safe),
  };
  w.dataLayer = w.dataLayer || [];
  const dataLayer = w.dataLayer;
  for (const entry of dataLayer) {
    const args = entry as { [i: number]: unknown; length: number } | null;
    if (args && args[0] === "config") {
      args[2] = Object.assign({}, args[2], page);
      if (args.length < 3) args.length = 3;
    }
  }
  const gtag = function gtag() {
    // biome-ignore lint/complexity/noArguments: gtag.js only replays arguments objects
    dataLayer.push(arguments);
  } as (...args: unknown[]) => void;
  gtag("set", page);
}

/** The inline <head> script the root route renders. */
export const URL_PRIVACY_BOOT_SCRIPT = `(${bootUrlPrivacy})(${sanitizeUrl},${JSON.stringify(SAFE_PARAMS)},${JSON.stringify(SUBSCRIBE_LINK_GLOBAL)});`;

let claimed: { entry: number; link: SubscribeLink } | undefined;

/**
 * The subscribe token the boot script took out of the URL, while the current
 * history entry is the one it arrived on. The first call (once the router
 * has indexed the entry) claims it for that entry's index, so it survives a
 * remount (the tree remounts once Clerk loads), a replace navigation and
 * back/forward, while a later visit to /subscribe in the same tab starts
 * clean.
 */
export function bootSubscribeLink(): SubscribeLink | undefined {
  if (typeof window === "undefined") return undefined;
  const state = window.history.state as { __TSR_index?: number } | null;
  const entry = state?.__TSR_index;
  if (entry === undefined) return undefined;
  const w = window as unknown as Record<string, SubscribeLink | undefined>;
  const found = w[SUBSCRIBE_LINK_GLOBAL];
  if (found) {
    claimed = { entry, link: found };
    delete w[SUBSCRIBE_LINK_GLOBAL];
  }
  return claimed?.entry === entry ? claimed.link : undefined;
}
