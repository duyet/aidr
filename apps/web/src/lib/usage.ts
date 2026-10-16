import type { Env } from "../../worker/types";

export type UsageSurface = "rss" | "api" | "mcp" | "llms" | "markdown";

export type ClientBucket =
  | "mcp-client"
  | "feed-reader"
  | "browser"
  | "bot"
  | "other";

export interface UsageEvent {
  surface: UsageSurface;
  route: string;
  tool?: string;
  status: number;
  client: ClientBucket;
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

const FEED_PATHS = new Set(["/feed.xml", "/rss.xml", "/feed.json"]);
const LLMS_PATHS = new Set(["/llms.txt", "/llms-full.txt"]);
const API_ROUTES = new Set([
  "/api/public",
  "/api/feed",
  "/api/feed.freshness",
  "/api/story/:id",
  "/api/week/:week",
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
      blobs: [event.surface, event.route, event.tool ?? "", event.client],
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
  const hit =
    classifyRequest(pathname) ??
    (negotiated
      ? { surface: "markdown" as const, route: templateRoute(pathname) }
      : null);
  if (!hit) return;
  recordUsage(env, {
    ...hit,
    status: response.status,
    client: clientBucket(request.headers.get("User-Agent")),
  });
}
