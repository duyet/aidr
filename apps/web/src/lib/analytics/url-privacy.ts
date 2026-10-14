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

/**
 * Drops the query params outside SAFE_PARAMS from a URL as written. The
 * rest (path encoding, hash) is kept byte for byte, and a URL with nothing
 * to drop comes back unchanged.
 */
function dropUnsafeParams(raw: string): string {
  const hash = raw.indexOf("#");
  const query = raw.indexOf("?");
  if (query === -1 || (hash !== -1 && hash < query)) return raw;
  const end = hash === -1 ? raw.length : hash;
  const pairs = raw.slice(query + 1, end).split("&");
  const kept = pairs.filter((pair) => {
    const key = new URLSearchParams(pair).keys().next().value;
    return key !== undefined && SAFE_PARAMS.includes(key);
  });
  if (kept.length === pairs.length) return raw;
  return (
    raw.slice(0, query) +
    (kept.length ? `?${kept.join("&")}` : "") +
    raw.slice(end)
  );
}

/** Property names whose values PostHog fills with a URL or path. */
const URL_KEY =
  /^(?:href|attr__href|\$referrer)$|(?:_url|_referrer|pathname|_path)$/;

function isOwnAbsoluteUrl(value: string, origin: string): boolean {
  return (
    value.startsWith(origin) &&
    /^(?:[/?#]|$)/.test(value.slice(origin.length)) &&
    !/\s/.test(value)
  );
}

function scrubString(value: string, key: string, origin: string): string {
  if (isOwnAbsoluteUrl(value, origin)) return dropUnsafeParams(value);
  if (URL_KEY.test(key) && value.startsWith("/") && !value.startsWith("//")) {
    return dropUnsafeParams(value);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const ELEMENT_HREF = /href="([^"]*)"/g;

/** Node attributes rrweb records that hold a link of the page. */
const LINK_ATTRIBUTES = ["href", "src", "action"];

/** A same-site URL: absolute on this origin, or relative (no scheme). */
function scrubSiteUrl(value: string, origin: string): string {
  if (isOwnAbsoluteUrl(value, origin)) return dropUnsafeParams(value);
  if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value) && !/\s/.test(value)) {
    return dropUnsafeParams(value);
  }
  return value;
}

/**
 * Walks an rrweb event body: full-snapshot nodes (`node`, `childNodes`) and
 * mutations (`adds[].node`, `attributes[].attributes`), and plugin events
 * such as `rrweb/network@1`, whose requests carry full URLs. Every
 * `attributes` record has its link-valued entries cleaned, and any absolute
 * URL of this site anywhere else is cleaned too. Relative text and URLs of
 * other sites are left as recorded.
 */
function scrubRecordedNode(value: unknown, origin: string): unknown {
  if (typeof value === "string") {
    return isOwnAbsoluteUrl(value, origin) ? dropUnsafeParams(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubRecordedNode(item, origin));
  }
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (key === "attributes" && isRecord(v)) {
      const attrs: Record<string, unknown> = { ...v };
      for (const name of LINK_ATTRIBUTES) {
        const link = attrs[name];
        if (typeof link === "string") attrs[name] = scrubSiteUrl(link, origin);
      }
      out[key] = attrs;
    } else {
      out[key] = scrubRecordedNode(v, origin);
    }
  }
  return out;
}

/**
 * PostHog `session_recording.maskCapturedNetworkRequestFn`. The network
 * plugin records each request's full URL as `name`, including the page's own
 * navigation entry, which keeps the URL it was loaded with.
 */
export function maskRecordedRequest<R extends { name?: string }>(
  request: R
): R {
  if (typeof request.name !== "string") return request;
  return {
    ...request,
    name: scrubSiteUrl(request.name, window.location.origin),
  };
}

/**
 * rrweb events in a `$snapshot`. The meta event carries the page URL. Full
 * snapshots and mutations carry the DOM, whose links (`href`, `src`,
 * `action`) can hold a token or search text. Everything else replays as
 * recorded.
 */
function scrubRecording(events: unknown, origin: string): unknown {
  if (!Array.isArray(events)) return events;
  return events.map((e) => {
    if (!isRecord(e) || !isRecord(e.data)) return e;
    if (e.type === 4 && typeof e.data.href === "string") {
      return {
        ...e,
        data: { ...e.data, href: scrubString(e.data.href, "href", origin) },
      };
    }
    return { ...e, data: scrubRecordedNode(e.data, origin) };
  });
}

/**
 * PostHog `before_send`. Drops unsafe query params from URLs of this site:
 * any absolute same-origin URL, and root-relative values under the keys
 * PostHog uses for URLs (`$current_url`, `$pathname`, `$referrer`, the
 * `$initial_*` and `$session_entry_*` values, autocaptured link hrefs).
 * Free text, links to other sites, and recorded text are left alone.
 */
export function scrubPosthogEvent<E>(event: E): E {
  const origin = window.location.origin;
  const visit = (value: unknown, key: string): unknown => {
    if (typeof value === "string") {
      if (key === "$elements_chain") {
        return value.replace(
          ELEMENT_HREF,
          (_match, href: string) =>
            `href="${scrubString(href, "href", origin)}"`
        );
      }
      return scrubString(value, key, origin);
    }
    if (key === "$snapshot_data") return scrubRecording(value, origin);
    if (Array.isArray(value)) return value.map((item) => visit(item, key));
    // Only plain records: the event also carries values like a Date
    // timestamp, which must pass through as they are. Keys can be URLs too
    // (`$heatmap_data` is keyed by page URL).
    if (isRecord(value)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[scrubString(k, "", origin)] = visit(v, k);
      }
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
 * The first script in <head>, ahead of the Cloudflare tag gateway's snippet
 * (the Worker puts it there, ssr-head.ts). Self-contained, because its
 * source is inlined.
 *
 * 1. Moves a subscribe token out of the URL into a window global, so no
 *    vendor ever reads it. Stripping it later is too late: once gtag.js has
 *    loaded, the `replaceState` sends a history page_view whose referrer is
 *    the tokened URL.
 * 2. Queues a sanitized page_location with `gtag('set')`, which reaches the
 *    page_view of every `config` queued after it. A `config` already queued
 *    (the gateway ran first) gets it patched in, since a later `set` does
 *    not reach that page_view.
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
  // Someone else's dataLayer that cannot be read or pushed to: gtag.js
  // cannot use it either, so there is no hit to clean up.
  if (!Array.isArray(dataLayer) || !Object.isExtensible(dataLayer)) return;
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

/** The inline script the Worker puts first in <head> (ssr-head.ts). */
export const URL_PRIVACY_BOOT_SCRIPT = `(${bootUrlPrivacy})(${sanitizeUrl},${JSON.stringify(SAFE_PARAMS)},${JSON.stringify(SUBSCRIBE_LINK_GLOBAL)});`;

/** The history state that carries `link` onto a new entry. */
export function subscribeLinkState(
  link: SubscribeLink
): Record<string, unknown> {
  return { [SUBSCRIBE_LINK_STATE]: link };
}

/** The history state key that carries a subscribe link on its entry. */
const SUBSCRIBE_LINK_STATE = "aidrSubscribeLink";

/** Set once the boot script handed over a link from this page load's URL. */
let arrivedInUrl = false;

/**
 * Client only, once, after the router has created its history and before it
 * hydrates. Moves the link the boot script took out of the URL onto the
 * history entry it arrived on. That state survives a remount, a reload and
 * back/forward to the entry, and the router compares it, so a link to the
 * same URL (the footer's "Get AI;DR") pushes a fresh entry without it.
 */
export function adoptSubscribeLink(): void {
  const w = window as unknown as Record<string, unknown>;
  const link = subscribeLinkOf({
    [SUBSCRIBE_LINK_STATE]: w[SUBSCRIBE_LINK_GLOBAL],
  });
  delete w[SUBSCRIBE_LINK_GLOBAL];
  if (!link) return;
  arrivedInUrl = true;
  window.history.replaceState(
    { ...window.history.state, [SUBSCRIBE_LINK_STATE]: link },
    ""
  );
}

/** The subscribe link a history entry's state carries, if well formed. */
export function subscribeLinkOf(state: unknown): SubscribeLink | undefined {
  const link = (state as Record<string, unknown> | null)?.[
    SUBSCRIBE_LINK_STATE
  ] as Partial<SubscribeLink> | undefined;
  if (
    (link?.kind === "unsubscribe" || link?.kind === "settings") &&
    typeof link.token === "string" &&
    link.token
  ) {
    return { kind: link.kind, token: link.token };
  }
  return undefined;
}

/** The history state key that holds the token an entry has unsubscribed. */
const UNSUBSCRIBED_STATE = "aidrUnsubscribed";

/**
 * Records on the current history entry that `token` has unsubscribed, so a
 * reload of the entry or Back to it shows the result instead of sending the
 * DELETE again, which could remove a subscription made since under the same
 * token (#723). Does nothing once the reader has left the entry that carries
 * the link.
 */
export function markUnsubscribed(token: string): void {
  const state = window.history.state;
  if (subscribeLinkOf(state)?.token !== token) return;
  window.history.replaceState({ ...state, [UNSUBSCRIBED_STATE]: token }, "");
}

/** Whether a history entry has already unsubscribed `token`. */
export function wasUnsubscribed(state: unknown, token: string): boolean {
  return (
    (state as Record<string, unknown> | null)?.[UNSUBSCRIBED_STATE] === token
  );
}

/**
 * The link to render for a history entry. Before hydration completes, only
 * if this page load's URL carried it: the server then saw the token and
 * rendered the same view. After a reload the server rendered the plain
 * page, so the entry's link shows once hydrated.
 */
export function subscribeLinkToRender(
  state: unknown,
  hydrated: boolean
): SubscribeLink | undefined {
  return hydrated || arrivedInUrl ? subscribeLinkOf(state) : undefined;
}
