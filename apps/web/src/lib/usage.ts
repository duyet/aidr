import type { Env } from "../../worker/types";
import { negotiableMarkdownPath } from "./markdown-negotiation";
import { SITE_URL } from "./site";

export type UsageSurface = "rss" | "api" | "mcp" | "llms" | "markdown";

export type ClientBucket =
  | "mcp-client"
  | "feed-reader"
  | "browser"
  | "bot"
  | "other"
  | "ios-app"
  | "chrome-extension"
  | "web";

export interface UsageEvent {
  surface: UsageSurface;
  route: string;
  tool?: string;
  status: number;
  client: ClientBucket;
  /** Set only for `ios-app` and `chrome-extension`; otherwise empty. */
  appVersion?: string;
}

/** The request header our own apps send: `<app>/<version>`. */
export const CLIENT_HEADER = "X-AIDR-Client";

/** The closed set of app names, and the bucket each counts under. */
const APP_BUCKETS = {
  ios: "ios-app",
  extension: "chrome-extension",
} as const satisfies Record<string, ClientBucket>;

/** `1.2.3` (2 to 4 dot-separated integers, as Chrome allows), with an optional
 *  `-label` and `+build`, e.g. `0.1.0+12`. Short on purpose: the version is a
 *  dataset blob, so a spoofed value must stay bounded. */
const APP_VERSION_RE =
  /^\d{1,5}(?:\.\d{1,5}){1,3}(?:-[0-9A-Za-z]{1,12})?(?:\+\d{1,6})?$/;

export interface ClientIdentity {
  client: ClientBucket;
  appVersion: string;
}

/** Parses `X-AIDR-Client`. Anything but `ios/<version>` or
 *  `extension/<version>` is null, so an unknown app or a garbage version
 *  falls through to the other signals. */
export function parseClientHeader(value: string | null): ClientIdentity | null {
  const slash = value?.indexOf("/") ?? -1;
  if (!value || slash < 0) return null;
  const app = value.slice(0, slash);
  const appVersion = value.slice(slash + 1);
  if (!Object.hasOwn(APP_BUCKETS, app) || !APP_VERSION_RE.test(appVersion)) {
    return null;
  }
  return { client: APP_BUCKETS[app as keyof typeof APP_BUCKETS], appVersion };
}

const MCP_CLIENT_RE =
  /\b(mcp|claude|cursor|windsurf|cline|continue|codex|openai|chatgpt|gemini|copilot|vscode|zed|goose)\b/i;
const FEED_READER_RE =
  /feedly|inoreader|newsblur|feedbin|miniflux|netnewswire|reeder|feedparser|tiny ?tiny ?rss|freshrss|rss|atom|syndication|flipboard|feedreader|thunderbird/i;
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|preview|fetcher/i;
const BROWSER_RE = /^(mozilla|opera)\//i;

/** Coarse on purpose: the raw user agent is never stored. */
export function clientBucket(userAgent: string | null): ClientBucket {
  const ua = userAgent ?? "";
  if (MCP_CLIENT_RE.test(ua)) return "mcp-client";
  if (FEED_READER_RE.test(ua)) return "feed-reader";
  if (BOT_RE.test(ua)) return "bot";
  if (BROWSER_RE.test(ua)) return "browser";
  return "other";
}

/** Who is asking, in this order: our own apps' header, an extension page's
 *  origin, a same-origin page of the site, then the User-Agent buckets. Every
 *  signal but the UA is client-supplied, so the buckets are telemetry, not
 *  proof. The raw header is never stored, only the bucket and a validated
 *  version. */
export function classifyClient(headers: Headers): ClientIdentity {
  const app = parseClientHeader(headers.get(CLIENT_HEADER));
  if (app) return app;
  if (headers.get("Origin")?.startsWith("chrome-extension://")) {
    return { client: "chrome-extension", appVersion: "" };
  }
  if (
    headers.get("Sec-Fetch-Site") === "same-origin" ||
    headers.get("Origin") === SITE_URL
  ) {
    return { client: "web", appVersion: "" };
  }
  return { client: clientBucket(headers.get("User-Agent")), appVersion: "" };
}

const FEED_PATHS = new Set(["/feed.xml", "/rss.xml", "/feed.json"]);
const LLMS_PATHS = new Set(["/llms.txt", "/llms-full.txt"]);
const API_ROUTES = new Set([
  "/api/public",
  "/api/feed",
  "/api/feed.freshness",
  "/api/story/:id",
  "/api/week/:week",
  "/api/thumb/:id",
]);
const MARKDOWN_ROUTES = new Set([
  "/api/story/:id.md",
  "/:id.md",
  "/date/:date.md",
  "/week/:week.md",
  "/index.md",
  "/index.html.md",
]);

/** Ids, dates and weeks become placeholders; the query is never read. */
export function templateRoute(pathname: string): string {
  return pathname
    .replace(/\/[0-9a-f]{8,64}(?=\.md$|\/|$)/gi, "/:id")
    .replace(/\/\d{4}-\d{2}-\d{2}(?=\.md$|\/|$)/g, "/:date")
    .replace(/\/\d{4}-W\d{2}(?=\.md$|\/|$)/g, "/:week");
}

/** The surface and route template a Worker request counts under, or null for
 *  paths this dataset does not track. Unknown templates are dropped so a
 *  scanner cannot inflate the dataset's cardinality. MCP tool calls are
 *  recorded by the MCP handler, one per call. */
export function classifyRequest(
  pathname: string
): Pick<UsageEvent, "surface" | "route"> | null {
  if (FEED_PATHS.has(pathname)) return { surface: "rss", route: pathname };
  if (LLMS_PATHS.has(pathname)) return { surface: "llms", route: pathname };
  const route = templateRoute(pathname);
  if (MARKDOWN_ROUTES.has(route)) return { surface: "markdown", route };
  if (API_ROUTES.has(route)) return { surface: "api", route };
  return null;
}

/** Fire-and-forget. A no-op without the binding; never throws. */
export function recordUsage(
  env: Pick<Env, "USAGE"> | undefined,
  event: UsageEvent
): void {
  try {
    env?.USAGE?.writeDataPoint({
      blobs: [
        event.surface,
        event.route,
        event.tool ?? "",
        event.client,
        event.appVersion ?? "",
      ],
      doubles: [1, event.status],
      indexes: [event.surface],
    });
  } catch {
    // Telemetry must never fail a request.
  }
}

export function recordRequestUsage(
  env: Pick<Env, "USAGE"> | undefined,
  request: Request,
  response: Response
): void {
  if (!env?.USAGE) return;
  const pathname = new URL(request.url).pathname;
  const negotiated = response.headers
    .get("Content-Type")
    ?.startsWith("text/markdown");
  // A negotiated page counts only when it is one of the negotiable pages;
  // any other path that answers text/markdown (e.g. a 404) is dropped, or a
  // scanner could write raw paths into the dataset.
  const hit =
    classifyRequest(pathname) ??
    (negotiated && negotiableMarkdownPath(pathname)
      ? { surface: "markdown" as const, route: templateRoute(pathname) }
      : null);
  if (!hit) return;
  recordUsage(env, {
    ...hit,
    status: response.status,
    ...classifyClient(request.headers),
  });
}
