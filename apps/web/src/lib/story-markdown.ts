import { readSession } from "./db";
import { SITE_URL } from "./site";
import { storyPath } from "./slug";
import { getStoryCandidates } from "./story-queries";
import type { FeedItem, Lang } from "./types";

/** Public, versioned Markdown representation of a published story. */
export const STORY_MARKDOWN_FORMAT = "aidr-story-markdown/v1";
export const STORY_MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";
export const STORY_MARKDOWN_CACHE_CONTROL =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=3600";
export const STORY_MARKDOWN_PRIVATE_CACHE_CONTROL = "private, no-store";
export const STORY_MARKDOWN_SUMMARY_MAX_CHARS = 1200;
export const STORY_MARKDOWN_MAX_URL_LENGTH = 1024;
export const STORY_MARKDOWN_MAX_RESPONSE_BYTES = 32_768;
export const STORY_MARKDOWN_MAX_SOURCES = 8;
export const STORY_MARKDOWN_MAX_SOURCE_ROWS_SCANNED = 16;
const MAX_REDIRECT_QUERY_PARAMS = 16;
const MAX_REDIRECT_QUERY_LENGTH = 1_024;
const MAX_REDIRECT_PARAM_LENGTH = 256;

const STORY_ID_RE = /^[0-9a-f]{8,64}$/;
const STORY_MARKDOWN_PATH_RE = /^\/api\/story\/.*\.md(?:\/|$)/i;
const NO_STORE = STORY_MARKDOWN_PRIVATE_CACHE_CONTROL;
const DEFAULT_LANG: Lang = "vi";
const LOCALE_QUERY_PARAM = "lang";
const LEGACY_LOCALE_QUERY_PARAM = "locale";
const LOCALE_VALUES = new Set<Lang>(["en", "vi"]);
const CREDENTIAL_KEY_PATTERN =
  /(^|[-_])(access[-_]?token|token|secret|password|passwd|api[-_]?key|apikey|auth(?:orization)?|bearer|jwt|session(?:[-_]?id)?|signature|sig|credential|client[-_]?secret|code)(?=$|[-_])/i;
const CREDENTIAL_VALUE_PATTERN =
  /(?:^|\s)(?:bearer|basic)\s+[a-z0-9._~+/=-]{8,}|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|(?:^|[?&#])(?:access[-_]?token|token|secret|password|api[-_]?key|auth|bearer|jwt|signature|sig|credential|code)=/i;
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.azure.internal",
  "instance-data",
  "100.100.100.200",
]);
const PRIVATE_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
];

type StoryMarkdownLocale = Lang;
type TranslationField = "title" | "summary";

interface StoryMarkdownHeadersOptions {
  cacheControl: string;
  contentLanguage?: string;
  canonicalUrl?: string;
  vary?: string;
  contentType?: string;
}

interface SourceLink {
  kind: "source" | "support" | "discussion";
  url: string;
}

interface LocaleResolution {
  lang: StoryMarkdownLocale;
  explicit: boolean;
  legacy: boolean;
}

interface LocaleError {
  error: string;
}

function isLang(value: unknown): value is Lang {
  return typeof value === "string" && LOCALE_VALUES.has(value as Lang);
}

function isControlCharacter(code: number): boolean {
  return (
    code <= 8 ||
    code === 11 ||
    code === 12 ||
    (code >= 14 && code <= 31) ||
    (code >= 0x80 && code <= 0x9f) ||
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
    .replace(
      /<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " "
    )
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clipText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  const clean = textWithoutMarkup(value);
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function escapeMarkdownText(
  value: unknown,
  maxChars = STORY_MARKDOWN_SUMMARY_MAX_CHARS
): string {
  return clipText(value, maxChars)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]{}()#+.!|~=-])/g, "\\$1");
}

function normalizedHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const host = normalizedHostname(hostname);
  if (host === "::" || host === "::1") return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
  if (host.startsWith("ff")) return true;
  const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return isPrivateIpv4(mapped[1]);
  const mappedHex = host.match(
    /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i
  );
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    return isPrivateIpv4(
      [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".")
    );
  }
  return false;
}

// No DNS lookup is needed: this handler never fetches a source URL. Reject
// literal/suffix forms that would expose internal or metadata destinations.
function isBlockedHost(hostname: string): boolean {
  const host = normalizedHostname(hostname);
  if (!host || BLOCKED_HOSTNAMES.has(host)) return true;
  if (PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)))
    return true;
  if (isPrivateIpv4(host)) return true;
  if (host.includes(":") && isPrivateIpv6(host)) return true;
  return false;
}

function isCredentialKey(key: string): boolean {
  return CREDENTIAL_KEY_PATTERN.test(key);
}

function isCredentialValue(value: string): boolean {
  return CREDENTIAL_VALUE_PATTERN.test(value);
}

function hasCredentialData(url: URL): boolean {
  for (const [key, value] of url.searchParams) {
    if (isCredentialKey(key) || isCredentialValue(value)) {
      return true;
    }
  }
  const fragment = url.hash.replace(/^#/, "");
  if (!fragment) return false;
  const fragmentParams = new URLSearchParams(fragment);
  for (const [key, value] of fragmentParams) {
    if (isCredentialKey(key) || isCredentialValue(value)) {
      return true;
    }
  }
  return isCredentialValue(fragment);
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  if (raw.length > STORY_MARKDOWN_MAX_URL_LENGTH || hasControlCharacters(raw)) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || !url.hostname) return null;
    if (isBlockedHost(url.hostname) || hasCredentialData(url)) return null;
    const normalized = url.toString();
    return normalized.length <= STORY_MARKDOWN_MAX_URL_LENGTH
      ? normalized
      : null;
  } catch {
    return null;
  }
}

function boundedString(value: unknown, maxChars: number): string | null {
  return clipText(value, maxChars) || null;
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
  const sourceRows = Array.isArray(item.sources) ? item.sources : [];
  for (const source of sourceRows.slice(
    0,
    STORY_MARKDOWN_MAX_SOURCE_ROWS_SCANNED
  )) {
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
  for (const tag of tags.slice(0, 40)) {
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

function vietnameseFields(item: Pick<FeedItem, "title_vi" | "summary_vi">): {
  title: string | null;
  summary: string | null;
} {
  return {
    title: boundedString(item.title_vi, 300),
    summary: boundedString(item.summary_vi, STORY_MARKDOWN_SUMMARY_MAX_CHARS),
  };
}

export function storyMarkdownLanguage(
  item: Pick<FeedItem, "title_vi" | "summary_vi">,
  requestedLang: StoryMarkdownLocale
): StoryMarkdownLocale {
  const vi = vietnameseFields(item);
  return requestedLang === "vi" && (vi.title !== null || vi.summary !== null)
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
  fallbackFields: TranslationField[];
} {
  const englishTitle = boundedString(item.title, 300) ?? "Untitled story";
  const englishSummary =
    boundedString(item.summary, STORY_MARKDOWN_SUMMARY_MAX_CHARS) ??
    "No summary is available.";
  const vi = vietnameseFields(item);
  const availableLangs: StoryMarkdownLocale[] = ["en"];
  if (vi.title !== null || vi.summary !== null) availableLangs.push("vi");

  const wantsVietnamese = requestedLang === "vi";
  const lang = storyMarkdownLanguage(item, requestedLang);
  const title = lang === "vi" && vi.title !== null ? vi.title : englishTitle;
  const summary =
    lang === "vi" && vi.summary !== null ? vi.summary : englishSummary;
  const fallbackFields: TranslationField[] = [];
  if (wantsVietnamese && vi.title === null) fallbackFields.push("title");
  if (wantsVietnamese && vi.summary === null) fallbackFields.push("summary");

  return {
    title,
    summary,
    lang,
    availableLangs,
    translationFallback: fallbackFields.length > 0 ? "en" : null,
    fallbackFields,
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
  requestedLang: StoryMarkdownLocale = DEFAULT_LANG
): string {
  const selected = selectedStoryText(item, requestedLang);
  const canonicalUrl = canonicalStoryUrl(item);
  const published = publishedDate(item.published_at);
  const links = sourceLinks(item);
  const topics = topicList(item.tags);
  const category = boundedString(item.category, 80);
  const sourceUrls = links.map((link) => link.url);
  const translationNote = selected.fallbackFields.length
    ? `_English fallback used for: ${selected.fallbackFields.join(", ")}._`
    : "";

  const fields: Array<[string, string]> = [
    ["format", jsonField(STORY_MARKDOWN_FORMAT)],
    ["id", jsonField(boundedString(item.id, 64) ?? "")],
    ["canonical_url", jsonField(canonicalUrl)],
    ["title", jsonField(selected.title)],
    ["lang", jsonField(selected.lang)],
    ["requested_lang", jsonField(requestedLang)],
    ["available_langs", jsonField(selected.availableLangs)],
    ["translation_fallback", jsonField(selected.translationFallback)],
    ["fallback_fields", jsonField(selected.fallbackFields)],
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

function decodePathname(pathname: string): string | null {
  try {
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes("\0") || decoded.includes("\\")) return null;
    return decoded;
  } catch {
    return null;
  }
}

function rawPathLooksLikeMarkdown(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return (
    /^\/api(?:\/|%2f)story\//i.test(lower) &&
    /(?:\.|%2e)(?:m|%6d)(?:d|%64)(?:\/|$)/i.test(lower)
  );
}

export function isStoryMarkdownPath(pathname: string): boolean {
  const decoded = decodePathname(pathname);
  if (decoded !== null) return STORY_MARKDOWN_PATH_RE.test(decoded);
  return rawPathLooksLikeMarkdown(pathname);
}

function storyIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/story\/([^/]+)\.md\/?$/i);
  return match && STORY_ID_RE.test(match[1]) ? match[1] : null;
}

function readCookieLang(cookieHeader: string | null): Lang | null {
  const values: string[] = [];
  for (const part of cookieHeader?.split(";") ?? []) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== "news_lang") continue;
    let value = rawValue.join("=").trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep the raw value; it will simply fail the exact locale check.
    }
    values.push(value);
  }
  const valid = [...new Set(values.filter(isLang))];
  return valid.length === 1 ? valid[0] : null;
}

function readAcceptLanguage(header: string | null): Lang | null {
  const candidates: Array<{ lang: Lang; q: number; index: number }> = [];
  for (const [index, part] of (header ?? "").split(",").entries()) {
    const [rawTag, ...parameters] = part.trim().split(";");
    const tag = rawTag.trim().toLowerCase().split("-")[0];
    if (!isLang(tag)) continue;
    const qParameter = parameters.find((parameter) =>
      parameter.trim().toLowerCase().startsWith("q=")
    );
    const parsedQ = qParameter
      ? Number.parseFloat(qParameter.trim().slice(2))
      : 1;
    const q = Number.isFinite(parsedQ) ? Math.min(1, Math.max(0, parsedQ)) : 0;
    if (q > 0) candidates.push({ lang: tag, q, index });
  }
  candidates.sort((a, b) => b.q - a.q || a.index - b.index);
  return candidates[0]?.lang ?? null;
}

/**
 * Endpoint-local locale parsing for the pilot. The shared HTML canonical and
 * hreflang rules remain owned by #140; this handler only normalizes its own
 * representation and does not redirect HTML story URLs.
 */
function resolveLocale(request: Request): LocaleResolution | LocaleError {
  const params = new URL(request.url).searchParams;
  const langValues = params.getAll(LOCALE_QUERY_PARAM);
  const localeValues = params.getAll(LEGACY_LOCALE_QUERY_PARAM);

  if (
    langValues.length > 1 ||
    localeValues.length > 1 ||
    (langValues.length > 0 && localeValues.length > 0)
  ) {
    return {
      error: "Repeated or conflicting locale parameters are not allowed.",
    };
  }

  const explicit = langValues[0] ?? localeValues[0];
  if (explicit !== undefined) {
    if (!isLang(explicit)) {
      return { error: "The locale parameter must be exactly en or vi." };
    }
    return {
      lang: explicit,
      explicit: true,
      legacy: localeValues.length === 1,
    };
  }

  return {
    lang:
      readCookieLang(request.headers.get("cookie")) ??
      readAcceptLanguage(request.headers.get("accept-language")) ??
      DEFAULT_LANG,
    explicit: false,
    legacy: false,
  };
}

function boundedRedirectSearch(url: URL): string {
  const bounded = new URLSearchParams();
  let count = 0;
  for (const [key, value] of url.searchParams) {
    if (
      count >= MAX_REDIRECT_QUERY_PARAMS ||
      key.length > MAX_REDIRECT_PARAM_LENGTH ||
      value.length > MAX_REDIRECT_PARAM_LENGTH ||
      isCredentialKey(key) ||
      isCredentialValue(value)
    ) {
      continue;
    }
    bounded.append(key, value);
    count += 1;
  }
  let serialized = bounded.toString();
  const keys = [...bounded.keys()];
  while (serialized.length > MAX_REDIRECT_QUERY_LENGTH && keys.length > 0) {
    const last = keys.pop();
    if (!last) break;
    bounded.delete(last);
    serialized = bounded.toString();
  }
  return serialized ? `?${serialized}` : "";
}

function canonicalRequestUrl(request: Request, lang: Lang): URL {
  const target = new URL(request.url);
  target.search = boundedRedirectSearch(target);
  target.searchParams.delete(LEGACY_LOCALE_QUERY_PARAM);
  target.searchParams.delete(LOCALE_QUERY_PARAM);
  target.searchParams.set(LOCALE_QUERY_PARAM, lang);
  return target;
}

function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers":
      "Content-Language, Link, X-Content-Type-Options, X-Robots-Tag",
  });
}

function responseHeaders(options: StoryMarkdownHeadersOptions): Headers {
  const headers = corsHeaders();
  headers.set(
    "Content-Type",
    options.contentType ?? STORY_MARKDOWN_CONTENT_TYPE
  );
  headers.set("Cache-Control", options.cacheControl);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, follow");
  if (options.contentLanguage)
    headers.set("Content-Language", options.contentLanguage);
  if (options.canonicalUrl) {
    headers.set("Link", `<${options.canonicalUrl}>; rel="canonical"`);
  }
  if (options.vary) headers.set("Vary", options.vary);
  return headers;
}

function bodyResponse(
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

function errorBody(status: number, title: string, message: string): string {
  return `${frontmatter([
    ["format", jsonField(STORY_MARKDOWN_FORMAT)],
    ["status", String(status)],
  ])}\n\n# ${title}\n\n${message}\n`;
}

function errorResponse(
  status: number,
  title: string,
  message: string,
  method: string,
  contentLanguage = "en"
): Response {
  return bodyResponse(
    errorBody(status, title, message),
    status,
    { cacheControl: NO_STORE, contentLanguage },
    method
  );
}

function plainTextNotFound(method: string): Response {
  return bodyResponse(
    "Story Markdown not found.\n",
    404,
    {
      cacheControl: NO_STORE,
      contentLanguage: "en",
      contentType: "text/plain; charset=utf-8",
    },
    method
  );
}

function redirectResponse(target: URL, lang: Lang, method: string): Response {
  const body = `Use ${target.pathname}${target.search} for the canonical locale.`;
  const headers = responseHeaders({
    cacheControl: NO_STORE,
    contentLanguage: lang,
    contentType: "text/plain; charset=utf-8",
  });
  headers.set("Location", target.toString());
  headers.set(
    "Content-Length",
    String(new TextEncoder().encode(body).byteLength)
  );
  return new Response(method === "HEAD" ? null : body, {
    status: 308,
    headers,
  });
}

function structuredLookupError(error: unknown): void {
  const errorType = error instanceof Error ? "D1Error" : "UnknownError";
  console.error(
    JSON.stringify({ event: "story_markdown.lookup_failed", errorType })
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

  const requestUrl = new URL(request.url);
  const decodedPath = decodePathname(requestUrl.pathname);
  if (decodedPath === null) return plainTextNotFound(method);
  const encodedPath = requestUrl.pathname !== decodedPath;
  const id = storyIdFromPath(decodedPath);
  if (!id) {
    return encodedPath
      ? plainTextNotFound(method)
      : errorResponse(
          404,
          "Story not found",
          "No published story matched the requested Markdown id.",
          method
        );
  }

  const locale = resolveLocale(request);
  if ("error" in locale) {
    return errorResponse(400, "Invalid language", locale.error, method);
  }

  const shouldNormalizeLocale = locale.legacy;
  const shouldNormalizeId = id.length > 8;
  if (shouldNormalizeLocale || shouldNormalizeId) {
    const target = new URL(request.url);
    target.pathname = `/api/story/${id.slice(0, 8)}.md`;
    if (shouldNormalizeLocale) {
      const canonical = canonicalRequestUrl(request, locale.lang);
      target.search = canonical.search;
    } else {
      target.search = boundedRedirectSearch(target);
    }
    return redirectResponse(target, locale.lang, method);
  }

  if (!db) {
    return errorResponse(
      503,
      "Story unavailable",
      "The story service is temporarily unavailable.",
      method
    );
  }

  let items: FeedItem[];
  try {
    items = await getStoryCandidates(readSession(db), id, 2);
  } catch (error) {
    structuredLookupError(error);
    return errorResponse(
      500,
      "Story unavailable",
      "The story could not be loaded right now.",
      method
    );
  }
  if (items.length > 1) {
    return errorResponse(
      409,
      "Ambiguous story id",
      "The requested id prefix matches more than one published story; use the full id.",
      method,
      locale.lang
    );
  }
  const item = items[0];
  if (!item) {
    return errorResponse(
      404,
      "Story not found",
      "No published story matched the requested Markdown id.",
      method,
      locale.lang
    );
  }

  const body = renderStoryMarkdown(item, locale.lang);
  if (
    new TextEncoder().encode(body).byteLength >
    STORY_MARKDOWN_MAX_RESPONSE_BYTES
  ) {
    return errorResponse(
      413,
      "Story representation too large",
      "This story could not be represented within the Markdown response limit.",
      method,
      locale.lang
    );
  }

  return bodyResponse(
    body,
    200,
    {
      cacheControl: locale.explicit
        ? STORY_MARKDOWN_CACHE_CONTROL
        : STORY_MARKDOWN_PRIVATE_CACHE_CONTROL,
      contentLanguage: storyMarkdownLanguage(item, locale.lang),
      canonicalUrl: canonicalStoryUrl(item),
      ...(locale.explicit ? {} : { vary: "Cookie, Accept-Language" }),
    },
    method
  );
}
