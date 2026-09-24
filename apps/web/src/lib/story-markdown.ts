import { readSession } from "./db";
import { SITE_URL } from "./site";
import { storyPath } from "./slug";
import { getStory } from "./story-queries";
import type { FeedItem, Lang } from "./types";

/** Public, versioned Markdown representation of a published story. */
export const STORY_MARKDOWN_FORMAT = "aidr-story-markdown/v1";
export const STORY_MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";
export const STORY_MARKDOWN_CACHE_CONTROL =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=3600";
export const STORY_MARKDOWN_SUMMARY_MAX_CHARS = 1200;
export const STORY_MARKDOWN_MAX_SOURCES = 8;

const STORY_ID_RE = /^[0-9a-f]{8,64}$/;
const STORY_MARKDOWN_PATH_RE = /^\/api\/story\/.*\.md(?:\/|$)/;
const NO_STORE = "private, no-store";

type StoryMarkdownLocale = Lang;

interface StoryMarkdownHeadersOptions {
  cacheControl: string;
  contentLanguage?: string;
  canonicalUrl?: string;
}

interface SourceLink {
  kind: "source" | "support" | "discussion";
  url: string;
}

function isControlCharacter(code: number): boolean {
  return (
    code <= 8 ||
    code === 11 ||
    code === 12 ||
    (code >= 14 && code <= 31) ||
    code === 127
  );
}

function removeControlCharacters(value: string): string {
  return [...value]
    .map((character) =>
      isControlCharacter(character.codePointAt(0) ?? 0) ? " " : character
    )
    .join("");
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) =>
    isControlCharacter(character.codePointAt(0) ?? 0)
  );
}

function textWithoutMarkup(value: string): string {
  return removeControlCharacters(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clipText(value: string, maxChars: number): string {
  const clean = textWithoutMarkup(value);
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function escapeMarkdownText(value: string): string {
  return clipText(value, STORY_MARKDOWN_SUMMARY_MAX_CHARS)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]{}()#+.!|])/g, "\\$1");
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  if (hasControlCharacters(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function boundedString(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const clean = clipText(value, maxChars);
  return clean || null;
}

function normalizedEpochSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const seconds = value > 1e12 ? value / 1000 : value;
  return Number.isFinite(seconds) ? seconds : null;
}

function publishedDate(value: unknown): string | null {
  const seconds = normalizedEpochSeconds(value);
  if (seconds === null) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function canonicalStoryUrl(item: Pick<FeedItem, "id">): string {
  const id = typeof item.id === "string" ? item.id.toLowerCase() : "";
  return STORY_ID_RE.test(id)
    ? `${SITE_URL}${storyPath({ id })}`
    : `${SITE_URL}/`;
}

function sourceKind(value: unknown): SourceLink["kind"] {
  return value === "support" || value === "discussion" ? value : "source";
}

function sourceLinks(item: FeedItem): SourceLink[] {
  const links: SourceLink[] = [];
  const seen = new Set<string>();

  const add = (kind: SourceLink["kind"], value: unknown) => {
    const url = safeHttpUrl(value);
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({ kind, url });
  };

  add("source", item.url);
  for (const source of Array.isArray(item.sources) ? item.sources : []) {
    if (links.length >= STORY_MARKDOWN_MAX_SOURCES) break;
    if (!source || typeof source !== "object") continue;
    add(sourceKind(source.kind), source.url);
  }
  return links.slice(0, STORY_MARKDOWN_MAX_SOURCES);
}

function topicList(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const tag of tags) {
    const topic = boundedString(tag, 80);
    if (!topic) continue;
    const key = topic.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(topic);
    if (topics.length >= 20) break;
  }
  return topics;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function storyMarkdownLanguage(
  item: Pick<FeedItem, "title_vi" | "summary_vi">,
  requestedLang: StoryMarkdownLocale
): StoryMarkdownLocale {
  return requestedLang === "vi" &&
    (hasText(item.title_vi) || hasText(item.summary_vi))
    ? "vi"
    : "en";
}

function selectedStoryText(
  item: FeedItem,
  requestedLang: StoryMarkdownLocale
): {
  title: string;
  summary: string;
  lang: StoryMarkdownLocale;
  availableLangs: StoryMarkdownLocale[];
  translationFallback: "en" | null;
} {
  const availableLangs: StoryMarkdownLocale[] = ["en"];
  if (hasText(item.title_vi) || hasText(item.summary_vi))
    availableLangs.push("vi");

  const wantsVietnamese = requestedLang === "vi";
  const hasVietnameseTitle = hasText(item.title_vi);
  const hasVietnameseSummary = hasText(item.summary_vi);
  const canUseVietnamese = storyMarkdownLanguage(item, requestedLang) === "vi";
  const lang: StoryMarkdownLocale = canUseVietnamese ? "vi" : "en";
  const title =
    canUseVietnamese && hasVietnameseTitle ? item.title_vi : item.title;
  const summary =
    canUseVietnamese && hasVietnameseSummary ? item.summary_vi : item.summary;
  const translationFallback =
    wantsVietnamese && (!hasVietnameseTitle || !hasVietnameseSummary)
      ? "en"
      : null;

  return {
    title: boundedString(title, 300) ?? "Untitled story",
    summary:
      boundedString(summary, STORY_MARKDOWN_SUMMARY_MAX_CHARS) ??
      "No summary is available.",
    lang,
    availableLangs,
    translationFallback,
  };
}

function jsonField(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

function frontmatter(fields: Array<[string, string]>): string {
  return [
    "---",
    ...fields.map(([key, value]) => `${key}: ${value}`),
    "---",
  ].join("\n");
}

function sourceLabel(kind: SourceLink["kind"]): string {
  if (kind === "discussion") return "Discussion";
  if (kind === "support") return "Supporting source";
  return "Story source";
}

/**
 * Render a published, already-sanitized D1 story as bounded Markdown.
 * Dynamic text is emitted as plain escaped text; URLs are limited to
 * absolute http(s) links and are never fetched.
 */
export function renderStoryMarkdown(
  item: FeedItem,
  requestedLang: StoryMarkdownLocale = "en"
): string {
  const selected = selectedStoryText(item, requestedLang);
  const canonicalUrl = canonicalStoryUrl(item);
  const published = publishedDate(item.published_at);
  const links = sourceLinks(item);
  const topics = topicList(item.tags);
  const category = boundedString(item.category, 80);
  const sourceUrls = links.map((link) => link.url);
  const translationNote = selected.translationFallback
    ? selected.lang === "vi"
      ? "_Some Vietnamese fields are missing; English is used for those fields._"
      : "_Vietnamese was requested, but this story has no Vietnamese translation; English is shown._"
    : "";

  const fields: Array<[string, string]> = [
    ["format", jsonField(STORY_MARKDOWN_FORMAT)],
    ["id", jsonField(typeof item.id === "string" ? clipText(item.id, 64) : "")],
    ["canonical_url", jsonField(canonicalUrl)],
    ["title", jsonField(selected.title)],
    ["lang", jsonField(selected.lang)],
    ["requested_lang", jsonField(requestedLang)],
    ["available_langs", jsonField(selected.availableLangs)],
    ["translation_fallback", jsonField(selected.translationFallback)],
    ["published_at", jsonField(published)],
    ["category", jsonField(category)],
    ["topics", jsonField(topics)],
    ["source_urls", jsonField(sourceUrls)],
    ["summary", jsonField(selected.summary)],
  ];

  const body = [
    frontmatter(fields),
    "",
    `# ${escapeMarkdownText(selected.title)}`,
    "",
    `> [Open the canonical story](<${canonicalUrl}>)`,
    "",
    `**Published:** ${published ?? "Unavailable"}`,
    ...(category ? [`**Category:** ${escapeMarkdownText(category)}`] : []),
    ...(topics.length > 0
      ? [
          `**Topics:** ${topics.map((topic) => escapeMarkdownText(topic)).join(", ")}`,
        ]
      : []),
    ...(translationNote ? ["", translationNote] : []),
    "",
    "## Summary",
    "",
    escapeMarkdownText(selected.summary),
    "",
    "## Sources",
    "",
    ...(links.length > 0
      ? links.map((link) => `- [${sourceLabel(link.kind)}](<${link.url}>)`)
      : ["_No safe source URL was recorded._"]),
    "",
  ].join("\n");

  return `${body}\n`;
}

export function isStoryMarkdownPath(pathname: string): boolean {
  return STORY_MARKDOWN_PATH_RE.test(pathname);
}

function storyIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/story\/(.*)\.md\/?$/);
  if (!match || match[1].includes("/")) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return STORY_ID_RE.test(id) ? id : null;
}

function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Allow-Max-Age": "86400",
    "Access-Control-Expose-Headers":
      "Content-Language, Link, X-Content-Type-Options, X-Robots-Tag",
  });
}

function responseHeaders(options: StoryMarkdownHeadersOptions): Headers {
  const headers = corsHeaders();
  headers.set("Content-Type", STORY_MARKDOWN_CONTENT_TYPE);
  headers.set("Cache-Control", options.cacheControl);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, follow");
  if (options.contentLanguage)
    headers.set("Content-Language", options.contentLanguage);
  if (options.canonicalUrl) {
    headers.set("Link", `<${options.canonicalUrl}>; rel="canonical"`);
  }
  return headers;
}

function errorBody(status: number, title: string, message: string): string {
  return `${frontmatter([
    ["format", jsonField(STORY_MARKDOWN_FORMAT)],
    ["status", String(status)],
  ])}\n\n# ${title}\n\n${message}\n`;
}

function markdownResponse(
  body: string,
  status: number,
  options: StoryMarkdownHeadersOptions,
  method: string
): Response {
  const headers = responseHeaders(options);
  const length = new TextEncoder().encode(body).byteLength;
  headers.set("Content-Length", String(length));
  return new Response(method === "HEAD" ? null : body, { status, headers });
}

function errorResponse(
  status: number,
  title: string,
  message: string,
  method: string
): Response {
  return markdownResponse(
    errorBody(status, title, message),
    status,
    { cacheControl: NO_STORE, contentLanguage: "en" },
    method
  );
}

/**
 * Worker-owned `/api/story/{id}.md` handler. It deliberately runs before
 * TanStack Start so a missing/invalid story cannot fall through to the SPA.
 */
export async function handleStoryMarkdownRequest(
  request: Request,
  db: D1Database | undefined
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") {
    const headers = corsHeaders();
    headers.set("Cache-Control", "no-store");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    return new Response(null, { status: 204, headers });
  }
  if (method !== "GET" && method !== "HEAD") {
    const response = errorResponse(
      405,
      "Method not allowed",
      "Use GET or HEAD for a story Markdown representation.",
      method
    );
    response.headers.set("Allow", "GET, HEAD, OPTIONS");
    return response;
  }

  const url = new URL(request.url);
  const id = storyIdFromPath(url.pathname);
  if (!id) {
    return errorResponse(
      404,
      "Story not found",
      "No published story matched the requested Markdown id.",
      method
    );
  }

  const requestedLang = url.searchParams.get("lang") ?? "en";
  if (requestedLang !== "en" && requestedLang !== "vi") {
    return errorResponse(
      400,
      "Invalid language",
      "The lang query parameter must be en or vi.",
      method
    );
  }

  if (!db) {
    return errorResponse(
      503,
      "Story unavailable",
      "The story service is temporarily unavailable.",
      method
    );
  }

  let item: FeedItem | null;
  try {
    item = await getStory(readSession(db), id);
  } catch (error) {
    console.error("story markdown lookup failed:", error);
    return errorResponse(
      500,
      "Story unavailable",
      "The story could not be loaded right now.",
      method
    );
  }
  if (!item) {
    return errorResponse(
      404,
      "Story not found",
      "No published story matched the requested Markdown id.",
      method
    );
  }

  const body = renderStoryMarkdown(item, requestedLang);
  return markdownResponse(
    body,
    200,
    {
      cacheControl: STORY_MARKDOWN_CACHE_CONTROL,
      contentLanguage: storyMarkdownLanguage(item, requestedLang),
      canonicalUrl: canonicalStoryUrl(item),
    },
    method
  );
}
