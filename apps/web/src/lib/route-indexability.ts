import { parseDataTab } from "./data-tab";
import { isLang } from "./lang";
import { SITEMAP_STATIC_PATHS } from "./sitemap";

export const INDEXABLE_ROBOTS = "index, follow";
export const NOINDEX_FOLLOW_ROBOTS = "noindex, follow";
export const NOINDEX_NOFOLLOW_ROBOTS = "noindex, nofollow";
export const PRIVATE_CACHE_CONTROL = "private, no-store";

const SAFE_REFERRER_POLICY = "strict-origin-when-cross-origin";
const NO_REFERRER_POLICY = "no-referrer";

const PUBLIC_STATIC_PATHS = new Set<string>(SITEMAP_STATIC_PATHS);
const SENSITIVE_QUERY_KEYS = new Set([
  "auth",
  "authorization",
  "code",
  "email",
  "key",
  "password",
  "preview",
  "secret",
  "session",
  "settings",
  "token",
  "unsubscribe",
]);
const SENSITIVE_QUERY_KEY_RE =
  /(?:^|[-_])(access[-_]?token|token|secret|password|passwd|api[-_]?key|apikey|auth(?:orization)?|bearer|jwt|session(?:[-_]?id)?|signature|sig|credential|client[-_]?secret|code)(?=$|[-_])/i;

/** Keep the Markdown contract compatible with PR #149. */
const STORY_MARKDOWN_PATH = /^\/api\/story\/[^/]+\.md(?:\/|$)/;
const STORY_JSON_PATH = /^\/api\/story\/[^/]+$/;
const OG_PATH = /^\/api\/og\/[^/]+$/;
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;
const ENCODED_PERCENT = /%25/gi;
// biome-ignore lint/suspicious/noControlCharactersInRegex: mirrors TanStack Router's path sanitizer
const PATH_UNSAFE_RE = /[\x00-\x1f\x7f"<>`{},]/g;

type SearchInput = Readonly<Record<string, unknown>> | URLSearchParams;

export interface RouteIndexabilityInput {
  pathname: string;
  search?: SearchInput;
  method?: string;
  status?: number;
}

export type RouteIndexabilityKind =
  | "public"
  | "faceted"
  | "private"
  | "api"
  | "not-found"
  | "error";

export interface RouteIndexabilityPolicy {
  kind: RouteIndexabilityKind;
  robots:
    | typeof INDEXABLE_ROBOTS
    | typeof NOINDEX_FOLLOW_ROBOTS
    | typeof NOINDEX_NOFOLLOW_ROBOTS;
  referrerPolicy: typeof SAFE_REFERRER_POLICY | typeof NO_REFERRER_POLICY;
  cacheControl?: typeof PRIVATE_CACHE_CONTROL;
}

const PUBLIC_POLICY: RouteIndexabilityPolicy = {
  kind: "public",
  robots: INDEXABLE_ROBOTS,
  referrerPolicy: SAFE_REFERRER_POLICY,
};

const FACETED_POLICY: RouteIndexabilityPolicy = {
  kind: "faceted",
  robots: NOINDEX_FOLLOW_ROBOTS,
  referrerPolicy: SAFE_REFERRER_POLICY,
};

const PRIVATE_POLICY: RouteIndexabilityPolicy = {
  kind: "private",
  robots: NOINDEX_NOFOLLOW_ROBOTS,
  referrerPolicy: NO_REFERRER_POLICY,
  cacheControl: PRIVATE_CACHE_CONTROL,
};

const API_POLICY: RouteIndexabilityPolicy = {
  kind: "api",
  robots: NOINDEX_FOLLOW_ROBOTS,
  referrerPolicy: SAFE_REFERRER_POLICY,
};

const NOT_FOUND_POLICY: RouteIndexabilityPolicy = {
  kind: "not-found",
  robots: NOINDEX_FOLLOW_ROBOTS,
  referrerPolicy: SAFE_REFERRER_POLICY,
  cacheControl: PRIVATE_CACHE_CONTROL,
};

const ERROR_POLICY: RouteIndexabilityPolicy = {
  kind: "error",
  robots: NOINDEX_FOLLOW_ROBOTS,
  referrerPolicy: SAFE_REFERRER_POLICY,
  cacheControl: PRIVATE_CACHE_CONTROL,
};

function sanitizePathSegment(segment: string): string {
  return segment.replace(
    PATH_UNSAFE_RE,
    (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
  );
}

function decodePathSegment(segment: string): string {
  let decoded: string;
  try {
    decoded = decodeURI(segment);
  } catch {
    decoded = segment.replaceAll(/%[0-9A-F]{2}/gi, (match) => {
      try {
        return decodeURI(match);
      } catch {
        return match;
      }
    });
  }
  return sanitizePathSegment(decoded);
}

/** Mirrors TanStack Router's decodePath without decoding path separators. */
function decodeRouterPath(path: string): string {
  if (!path) return path;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: mirrors TanStack Router's path decoder
  if (!/[%\\\x00-\x1f\x7f]/.test(path)) return path;

  const separator = /%25|%5C/gi;
  let result = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while (true) {
    match = separator.exec(path);
    if (match === null) break;
    result += decodePathSegment(path.slice(cursor, match.index)) + match[0];
    cursor = separator.lastIndex;
  }
  return result + decodePathSegment(path.slice(cursor));
}

function hasMalformedPercentEncoding(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "%") continue;
    if (!/^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))) return true;
  }
  return false;
}

function hasEncodedPathSeparator(value: string): boolean {
  let candidate = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (ENCODED_PATH_SEPARATOR.test(candidate)) return true;
    const next = candidate.replace(ENCODED_PERCENT, "%");
    if (next === candidate) return false;
    candidate = next;
  }
  return /%(?:25|2f|5c)/i.test(candidate);
}

/**
 * Return the path the router would classify, or null for an ambiguous alias.
 * Encoded unreserved characters are decoded; encoded separators and malformed
 * encodings fail closed instead of being treated as a different route.
 */
export function canonicalRoutePath(pathname: string): string | null {
  if (!pathname) return "/";
  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    hasMalformedPercentEncoding(pathname) ||
    hasEncodedPathSeparator(pathname)
  ) {
    return null;
  }

  const decoded = decodeRouterPath(pathname);
  if (
    hasMalformedPercentEncoding(decoded) ||
    hasEncodedPathSeparator(decoded) ||
    decoded.includes("//") ||
    decoded.includes("\\") ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: reject decoded controls
    /[\x00-\x1f\x7f]/.test(decoded)
  ) {
    return null;
  }
  return decoded.replace(/\/+$/, "") || "/";
}

function searchValue(search: SearchInput | undefined, key: string): unknown {
  if (!search) return undefined;
  if (search instanceof URLSearchParams) {
    const values = search.getAll(key);
    if (values.length === 0) return undefined;
    return values.length === 1 ? values[0] : values;
  }
  return search[key];
}

function searchKeys(search: SearchInput | undefined): string[] {
  if (!search) return [];
  return search instanceof URLSearchParams
    ? [...search.keys()]
    : Object.keys(search);
}

function hasKey(search: SearchInput | undefined, key: string): boolean {
  return searchKeys(search).includes(key);
}

function hasSensitiveQuery(search: SearchInput | undefined): boolean {
  return searchKeys(search).some((key) => {
    const normalized = key.toLowerCase();
    return (
      SENSITIVE_QUERY_KEYS.has(normalized) ||
      SENSITIVE_QUERY_KEY_RE.test(normalized)
    );
  });
}

function hasAnyQuery(search: SearchInput | undefined): boolean {
  return searchKeys(search).length > 0;
}

function hasCanonicalLocaleOnly(search: SearchInput | undefined): boolean {
  const keys = searchKeys(search);
  if (keys.length !== 1 || keys[0] !== "lang") return false;
  const value = searchValue(search, "lang");
  return typeof value === "string" && isLang(value);
}

function hasLocaleQuery(search: SearchInput | undefined): boolean {
  return searchKeys(search).some((key) => key === "lang" || key === "locale");
}

function isPathOrChild(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function isStoryPath(pathname: string): boolean {
  return /^\/[0-9a-f]{8,64}$/.test(pathname);
}

function isExplicitPublicApiPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return (
    lower === "/api/extension" ||
    lower === "/api/feed" ||
    lower === "/api/feed/freshness" ||
    lower === "/api/public" ||
    lower === "/api/system" ||
    lower.startsWith("/api/system/") ||
    STORY_JSON_PATH.test(pathname) ||
    STORY_MARKDOWN_PATH.test(pathname) ||
    OG_PATH.test(pathname)
  );
}

function isUnsafeMethod(method: string | undefined): boolean {
  const normalized = method?.toUpperCase() ?? "GET";
  return (
    normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS"
  );
}

function isErrorStatus(status: number | undefined): boolean {
  return (
    status !== undefined && (status < 200 || (status >= 400 && status <= 599))
  );
}

function safeResponseStatus(status: number): number {
  return status >= 200 && status <= 599 ? status : 502;
}

function applyQueryPolicy(
  policy: RouteIndexabilityPolicy,
  search: SearchInput | undefined
): RouteIndexabilityPolicy {
  if (hasSensitiveQuery(search)) return PRIVATE_POLICY;
  if (hasCanonicalLocaleOnly(search)) return policy;
  if (hasLocaleQuery(search)) {
    const keys = searchKeys(search);
    const localeKeys = keys.filter((key) => key === "lang" || key === "locale");
    const localeValue = searchValue(search, "lang");
    if (
      localeKeys.length === 1 &&
      keys.includes("lang") &&
      typeof localeValue === "string" &&
      isLang(localeValue)
    ) {
      return FACETED_POLICY;
    }
    return PRIVATE_POLICY;
  }
  return hasAnyQuery(search) ? FACETED_POLICY : policy;
}

function classifyRoute({
  pathname: rawPathname,
  search,
  method,
}: Omit<RouteIndexabilityInput, "status">): RouteIndexabilityPolicy {
  const decodedPath = canonicalRoutePath(rawPathname);
  if (!decodedPath) return PRIVATE_POLICY;
  const pathname = decodedPath.toLowerCase();

  if (
    pathname === "/mail" ||
    isPathOrChild(pathname, "/sign-in") ||
    isPathOrChild(pathname, "/sign-up") ||
    isPathOrChild(pathname, "/__clerk") ||
    isPathOrChild(pathname, "/api/admin") ||
    pathname === "/api/mcp" ||
    (pathname === "/subscribe" && hasSensitiveQuery(search)) ||
    (pathname === "/api/subscribe" &&
      (hasKey(search, "token") || isUnsafeMethod(method)))
  ) {
    return PRIVATE_POLICY;
  }

  if (pathname === "/api/subscribe/preview") {
    return hasAnyQuery(search)
      ? applyQueryPolicy(API_POLICY, search)
      : PRIVATE_POLICY;
  }

  if (pathname === "/data") {
    if (parseDataTab(searchValue(search, "tab")) === "admin") {
      return PRIVATE_POLICY;
    }
    return applyQueryPolicy(PUBLIC_POLICY, search);
  }

  if (PUBLIC_STATIC_PATHS.has(pathname) || isStoryPath(decodedPath)) {
    return applyQueryPolicy(PUBLIC_POLICY, search);
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return isExplicitPublicApiPath(pathname)
      ? applyQueryPolicy(API_POLICY, search)
      : PRIVATE_POLICY;
  }

  return NOT_FOUND_POLICY;
}

/**
 * One effective indexability contract for HTML and non-HTML responses.
 *
 * The status is applied last so a public route that ultimately returns a
 * 4xx/5xx cannot accidentally emit an indexable response.
 */
export function routeIndexability(
  input: RouteIndexabilityInput
): RouteIndexabilityPolicy {
  const policy = classifyRoute(input);
  if (!isErrorStatus(input.status) || policy.kind === "private") return policy;
  return ERROR_POLICY;
}

/** Apply the same route contract to HTTP responses after route rendering. */
export async function withRouteIndexabilityHeaders(
  request: Request,
  response: Response | Promise<Response>
): Promise<Response> {
  const resolvedResponse = await response;
  const status = safeResponseStatus(resolvedResponse.status);
  const url = new URL(request.url);
  const policy = routeIndexability({
    pathname: url.pathname,
    search: url.searchParams,
    method: request.method,
    status,
  });
  const headers = new Headers(resolvedResponse.headers);
  if (headers.get("X-Robots-Tag") !== "noindex, nofollow") {
    headers.set("X-Robots-Tag", policy.robots);
  }
  if (headers.get("Referrer-Policy") !== "no-referrer") {
    headers.set("Referrer-Policy", policy.referrerPolicy);
  }
  if (policy.cacheControl) {
    headers.set("Cache-Control", policy.cacheControl);
  }

  return new Response(resolvedResponse.body, {
    status,
    statusText: resolvedResponse.statusText,
    headers,
  });
}
