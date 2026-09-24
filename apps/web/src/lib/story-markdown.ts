import { readSession } from "./db";
import {
  DEFAULT_LANG,
  LOCALE_QUERY_PARAM,
  type LocaleResolution,
  resolveLocale,
} from "./lang";
import {
  absoluteSiteUrl,
  canonicalLocaleRedirect,
  localeCacheControl,
} from "./locale-url";
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
const MAX_SOURCE_QUERY_PARAMS = 16;
const MAX_REDIRECT_QUERY_PARAMS = 16;
const MAX_REDIRECT_QUERY_LENGTH = 1_024;
const MAX_QUERY_KEY_LENGTH = 64;
const MAX_QUERY_VALUE_LENGTH = 256;
const MAX_PATH_SEGMENT_LENGTH = 512;
const MAX_REDIRECT_PARAM_LENGTH = 256;
const MAX_CREDENTIAL_DECODE_ROUNDS = 3;
const MAX_PATH_DECODE_ROUNDS = 3;
const MAX_PATH_ROUTE_MATCH_ROUNDS = 8;

const STORY_ID_RE = /^[0-9a-f]{8,64}$/;
const STORY_MARKDOWN_PATH_RE = /^\/api\/story\/.*\.md(?:\/|$)/i;
const SAFE_QUERY_KEYS = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "id",
  "limit",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "offset",
  "order",
  "p",
  "page",
  "q",
  "query",
  "ref",
  "search",
  "sort",
  "source",
  "start",
]);
const CREDENTIAL_KEY_TOKENS = new Set([
  "access",
  "apikey",
  "auth",
  "authentication",
  "authorization",
  "bearer",
  "client",
  "code",
  "credential",
  "idtoken",
  "jwt",
  "key",
  "passwd",
  "password",
  "pwd",
  "refreshtoken",
  "secret",
  "session",
  "sig",
  "signature",
  "token",
]);
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

type QueryEntry = [key: string, value: string];

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

function decodeBoundedComponent(
  value: unknown,
  maxLength: number
): string | null {
  if (typeof value !== "string" || value.length > maxLength) return null;

  let current = value;
  for (let round = 0; round <= MAX_CREDENTIAL_DECODE_ROUNDS; round += 1) {
    if (current.length > maxLength || hasControlCharacters(current))
      return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (decoded === current) return current;
    current = decoded;
  }
  return null;
}

function normalizedCredentialKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isCredentialKey(key: string): boolean {
  const normalized = normalizedCredentialKey(key);
  return (
    CREDENTIAL_KEY_TOKENS.has(normalized) ||
    normalized.split("_").some((part) => CREDENTIAL_KEY_TOKENS.has(part))
  );
}

function isSafeQueryKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return (
    /^[a-z][a-z0-9_]{0,63}$/.test(normalized) &&
    (SAFE_QUERY_KEYS.has(normalized) ||
      /^utm_[a-z0-9_]{1,48}$/.test(normalized))
  );
}

function hasCredentialScheme(value: string): boolean {
  return value
    .replace(/\+/g, " ")
    .split(/[\s,;:=]+/u)
    .some(
      (part) =>
        part.toLowerCase() === "basic" || part.toLowerCase() === "bearer"
    );
}

function isJwt(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  );
}

function compoundValueHasCredential(value: string, depth = 0): boolean {
  if (hasCredentialScheme(value) || isJwt(value)) return true;
  if (depth >= 3) return value.includes("=");

  for (const assignment of value.split(/[?&;]+/u)) {
    const separator = assignment.indexOf("=");
    if (separator > 0) {
      const key = assignment.slice(0, separator);
      const nestedValue = assignment.slice(separator + 1);
      if (isCredentialKey(key)) return true;
      if (compoundValueHasCredential(nestedValue, depth + 1)) return true;
    }
  }
  return false;
}

/** Reject nested URL syntax at any decoded assignment/query depth. */
function sanitizeQueryValue(value: string): string | null {
  const normalized = value.trim();
  if (
    normalized.includes("#") ||
    compoundValueHasCredential(normalized) ||
    /https?\s*:/i.test(normalized) ||
    normalized.includes("://") ||
    /(?:^|[=?&;\s])\/\//u.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

/** Keep only allowlisted query keys after recursively decoding each component. */
function sanitizeSearchParams(
  params: URLSearchParams,
  maxEntries: number,
  maxValueLength = MAX_QUERY_VALUE_LENGTH
): QueryEntry[] {
  const safe: QueryEntry[] = [];
  const maxInspected = maxEntries * 4;
  let inspected = 0;
  for (const [rawKey, rawValue] of params) {
    if (safe.length >= maxEntries || inspected >= maxInspected) break;
    inspected += 1;
    const decodedKey = decodeBoundedComponent(rawKey, MAX_QUERY_KEY_LENGTH);
    if (decodedKey === null || isCredentialKey(decodedKey)) continue;
    const key = decodedKey.trim().toLowerCase();
    if (!isSafeQueryKey(key)) continue;
    const decodedValue = decodeBoundedComponent(rawValue, maxValueLength);
    if (decodedValue === null) continue;
    const value = sanitizeQueryValue(decodedValue);
    if (value === null) continue;
    safe.push([key, value]);
  }
  return safe;
}

function safePathname(pathname: string): boolean {
  for (const segment of pathname.split("/")) {
    const decoded = decodeBoundedComponent(segment, MAX_PATH_SEGMENT_LENGTH);
    if (
      decoded === null ||
      decoded.includes("#") ||
      isCredentialKey(decoded) ||
      hasCredentialScheme(decoded) ||
      isJwt(decoded)
    ) {
      return false;
    }
  }
  return true;
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
    if (url.username || url.password || !url.hostname || url.hash) return null;
    if (isBlockedHost(url.hostname) || !safePathname(url.pathname)) return null;
    const safeQuery = new URLSearchParams(
      sanitizeSearchParams(url.searchParams, MAX_SOURCE_QUERY_PARAMS)
    ).toString();
    url.search = safeQuery;
    url.hash = "";
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

function canonicalStoryUrl(
  item: Pick<FeedItem, "id">,
  requestedLang: StoryMarkdownLocale
): string {
  const id = typeof item.id === "string" ? item.id.toLowerCase() : "";
  return absoluteSiteUrl(
    STORY_ID_RE.test(id) ? storyPath({ id }) : "/",
    requestedLang
  );
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
  const canonicalUrl = canonicalStoryUrl(item, requestedLang);
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

interface DecodedPathname {
  value: string | null;
  encoded: boolean;
  reject: boolean;
}

function containsMalformedPercentEncoding(value: string): boolean {
  return value.replace(/%[0-9a-f]{2}/gi, "").includes("%");
}

function decodePathname(pathname: string): DecodedPathname {
  let current = pathname;
  let rounds = 0;

  while (rounds < MAX_PATH_DECODE_ROUNDS && /%[0-9a-f]{2}/i.test(current)) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return { value: null, encoded: true, reject: true };
    }
    if (decoded === current) break;
    current = decoded;
    rounds += 1;
  }

  const reject =
    rounds > 1 ||
    /%[0-9a-f]{2}/i.test(current) ||
    containsMalformedPercentEncoding(current) ||
    current.includes("\0") ||
    current.includes("\\");
  return {
    value: current,
    encoded: pathname !== current,
    reject,
  };
}

function looksLikeStoryPathPrefix(value: string): boolean {
  return /^\/api(?:\/|%2f|%25)[^?#]*story/i.test(value);
}

export function isStoryMarkdownPath(pathname: string): boolean {
  let current = pathname;
  for (let round = 0; round <= MAX_PATH_ROUTE_MATCH_ROUNDS; round += 1) {
    if (STORY_MARKDOWN_PATH_RE.test(current)) return true;
    if (!/%[0-9a-f]{2}/i.test(current)) {
      return (
        containsMalformedPercentEncoding(current) &&
        looksLikeStoryPathPrefix(current)
      );
    }
    try {
      current = decodeURIComponent(current);
    } catch {
      return looksLikeStoryPathPrefix(pathname);
    }
  }
  return looksLikeStoryPathPrefix(current);
}

function storyIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/story\/([^/]+)\.md\/?$/i);
  return match && STORY_ID_RE.test(match[1]) ? match[1] : null;
}

type ResolvedLocale = Extract<LocaleResolution, { ok: true }>;

function serializeRedirectEntries(
  entries: QueryEntry[],
  lang: StoryMarkdownLocale
): string {
  const params = new URLSearchParams(entries);
  params.set(LOCALE_QUERY_PARAM, lang);
  return params.toString();
}

function boundedRedirectSearch(url: URL, lang: StoryMarkdownLocale): string {
  let entries = sanitizeSearchParams(
    url.searchParams,
    MAX_REDIRECT_QUERY_PARAMS - 1,
    MAX_REDIRECT_PARAM_LENGTH
  );
  while (
    entries.length > 0 &&
    serializeRedirectEntries(entries, lang).length > MAX_REDIRECT_QUERY_LENGTH
  ) {
    entries = entries.slice(0, -1);
  }
  const serialized = serializeRedirectEntries(entries, lang);
  return serialized ? `?${serialized}` : "";
}

function canonicalRedirectTarget(
  requestUrl: URL,
  id: string,
  locale: ResolvedLocale
): URL {
  const pathname = `/api/story/${id.slice(0, 8)}.md`;
  const normalized = locale.legacy
    ? canonicalLocaleRedirect(pathname, requestUrl.search, "", locale.lang)
    : null;
  const target = new URL(
    normalized ?? `${pathname}${requestUrl.search}`,
    requestUrl
  );
  target.hash = "";
  target.search = boundedRedirectSearch(target, locale.lang);
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
    { cacheControl: STORY_MARKDOWN_PRIVATE_CACHE_CONTROL, contentLanguage },
    method
  );
}

function plainTextNotFound(method: string): Response {
  return bodyResponse(
    "Story Markdown not found.\n",
    404,
    {
      cacheControl: STORY_MARKDOWN_PRIVATE_CACHE_CONTROL,
      contentLanguage: "en",
      contentType: "text/plain; charset=utf-8",
    },
    method
  );
}

type StoryLookup =
  | { status: "found"; item: FeedItem }
  | { status: "not_found" }
  | { status: "ambiguous_prefix" }
  | { status: "ambiguous_full" };

async function lookupStoryForMarkdown(
  db: D1Database,
  id: string
): Promise<StoryLookup> {
  const reader = readSession(db);
  const candidates = await getStoryCandidates(reader, id, 2);
  if (candidates.length > 1) return { status: "ambiguous_prefix" };
  const candidate = candidates[0];
  if (!candidate) return { status: "not_found" };
  if (id.length === 8) return { status: "found", item: candidate };

  const canonicalCandidates = await getStoryCandidates(
    reader,
    id.slice(0, 8),
    2
  );
  if (canonicalCandidates.length > 1) return { status: "ambiguous_prefix" };
  if (canonicalCandidates[0]?.id !== candidate.id) {
    return { status: "ambiguous_full" };
  }
  return { status: "found", item: candidate };
}

function redirectResponse(
  target: URL,
  lang: Lang,
  method: string,
  status: 307 | 308
): Response {
  const body = `Use ${target.pathname}${target.search} for the canonical locale.`;
  const headers = responseHeaders({
    cacheControl: STORY_MARKDOWN_PRIVATE_CACHE_CONTROL,
    contentLanguage: lang,
    contentType: "text/plain; charset=utf-8",
    vary: "Cookie, Accept-Language",
  });
  headers.set("Location", target.toString());
  headers.set(
    "Content-Length",
    String(new TextEncoder().encode(body).byteLength)
  );
  return new Response(method === "HEAD" ? null : body, {
    status,
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
  if (decodedPath.value === null || decodedPath.reject) {
    return plainTextNotFound(method);
  }
  const id = storyIdFromPath(decodedPath.value);
  if (!id) {
    return decodedPath.encoded
      ? plainTextNotFound(method)
      : errorResponse(
          404,
          "Story not found",
          "No published story matched the requested Markdown id.",
          method
        );
  }

  const locale = resolveLocale({
    search: requestUrl.search,
    cookie: request.headers.get("cookie"),
    acceptLanguage: request.headers.get("accept-language"),
  });
  if (!locale.ok) {
    return errorResponse(400, "Invalid language", locale.message, method);
  }

  if (!db) {
    return errorResponse(
      503,
      "Story unavailable",
      "The story service is temporarily unavailable.",
      method,
      locale.lang
    );
  }

  let lookup: StoryLookup;
  try {
    lookup = await lookupStoryForMarkdown(db, id);
  } catch (error) {
    structuredLookupError(error);
    return errorResponse(
      500,
      "Story unavailable",
      "The story could not be loaded right now.",
      method,
      locale.lang
    );
  }

  if (lookup.status === "not_found") {
    return errorResponse(
      404,
      "Story not found",
      "No published story matched the requested Markdown id.",
      method,
      locale.lang
    );
  }
  if (lookup.status === "ambiguous_prefix") {
    return errorResponse(
      409,
      "Ambiguous story id",
      "The requested id prefix matches more than one published story; no canonical redirect was attempted.",
      method,
      locale.lang
    );
  }
  if (lookup.status === "ambiguous_full") {
    return errorResponse(
      409,
      "Unsafe story id canonicalization",
      "The requested id prefix could not be mapped to one unique 8-character canonical prefix.",
      method,
      locale.lang
    );
  }

  if (id.length > 8 || locale.legacy) {
    const target = canonicalRedirectTarget(requestUrl, id, locale);
    return redirectResponse(
      target,
      locale.lang,
      method,
      locale.legacy ? 307 : 308
    );
  }

  const item = lookup.item;

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
      contentLanguage: storyMarkdownLanguage(item, locale.lang),
      canonicalUrl: canonicalStoryUrl(item, locale.lang),
      ...localeCacheControl(requestUrl.search, STORY_MARKDOWN_CACHE_CONTROL),
    },
    method
  );
}
