import { SITEMAP_STATIC_PATHS } from "./sitemap";

export const INDEXABLE_ROBOTS = "index, follow";
export const NOINDEX_FOLLOW_ROBOTS = "noindex, follow";
export const NOINDEX_NOFOLLOW_ROBOTS = "noindex, nofollow";
export const PRIVATE_CACHE_CONTROL = "private, no-store";

const SAFE_REFERRER_POLICY = "strict-origin-when-cross-origin";
const NO_REFERRER_POLICY = "no-referrer";

const PUBLIC_STATIC_PATHS = new Set<string>(SITEMAP_STATIC_PATHS);
const HOMEPAGE_FACETS = ["q", "tag", "category", "aidr"] as const;
const FEED_FACETS = ["q", "category", "days", "before"] as const;

type SearchInput = Readonly<Record<string, unknown>> | URLSearchParams;

export interface RouteIndexabilityInput {
  pathname: string;
  search?: SearchInput;
  method?: string;
}

export type RouteIndexabilityKind =
  | "public"
  | "faceted"
  | "private"
  | "operational"
  | "not-found";

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

const OPERATIONAL_POLICY: RouteIndexabilityPolicy = {
  kind: "operational",
  robots: NOINDEX_NOFOLLOW_ROBOTS,
  referrerPolicy: SAFE_REFERRER_POLICY,
};

const NOT_FOUND_POLICY: RouteIndexabilityPolicy = {
  kind: "not-found",
  robots: NOINDEX_FOLLOW_ROBOTS,
  referrerPolicy: SAFE_REFERRER_POLICY,
  cacheControl: PRIVATE_CACHE_CONTROL,
};

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

function searchValues(
  search: SearchInput | undefined,
  key: string
): readonly string[] {
  if (!search) return [];
  if (search instanceof URLSearchParams) return search.getAll(key);

  const value = search[key];
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function hasValue(search: SearchInput | undefined, key: string): boolean {
  return searchValues(search, key).some((value) => value.trim().length > 0);
}

function hasAnyValue(
  search: SearchInput | undefined,
  keys: readonly string[]
): boolean {
  return keys.some((key) => hasValue(search, key));
}

function firstSearchValue(
  search: SearchInput | undefined,
  key: string
): string | undefined {
  return searchValues(search, key).find((value) => value.trim().length > 0);
}

function isPathOrChild(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function isStoryPath(pathname: string): boolean {
  return /^\/[0-9a-f]{8,64}$/.test(pathname);
}

function isUnsafeMethod(method: string | undefined): boolean {
  const normalized = method?.toUpperCase() ?? "GET";
  return (
    normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS"
  );
}

/**
 * One indexability contract for HTML and non-HTML responses.
 *
 * Public static pages come from the existing sitemap contract. Story
 * permalinks remain indexable. Private/authenticated, tokenized, preview,
 * and admin views fail closed; search and faceted variants stay crawlable
 * but are excluded from the index.
 */
export function routeIndexability({
  pathname: rawPathname,
  search,
  method,
}: RouteIndexabilityInput): RouteIndexabilityPolicy {
  const pathname = normalizePath(rawPathname);

  if (
    pathname === "/mail" ||
    isPathOrChild(pathname, "/sign-in") ||
    isPathOrChild(pathname, "/sign-up") ||
    pathname === "/api/mcp" ||
    isPathOrChild(pathname, "/api/admin") ||
    pathname === "/api/subscribe/preview" ||
    (pathname === "/subscribe" &&
      hasAnyValue(search, ["unsubscribe", "settings"])) ||
    (pathname === "/api/subscribe" &&
      (hasValue(search, "token") || isUnsafeMethod(method)))
  ) {
    return PRIVATE_POLICY;
  }

  if (pathname === "/" && hasAnyValue(search, HOMEPAGE_FACETS)) {
    return FACETED_POLICY;
  }

  if (pathname === "/subscribe" && hasValue(search, "tab")) {
    return FACETED_POLICY;
  }

  if (pathname === "/data") {
    if (firstSearchValue(search, "tab")?.toLowerCase() === "admin") {
      return PRIVATE_POLICY;
    }
    if (hasValue(search, "tab")) return FACETED_POLICY;
    return PUBLIC_POLICY;
  }

  if (pathname === "/api/feed" && hasAnyValue(search, FEED_FACETS)) {
    return FACETED_POLICY;
  }

  if (PUBLIC_STATIC_PATHS.has(pathname) || isStoryPath(pathname)) {
    return PUBLIC_POLICY;
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return OPERATIONAL_POLICY;
  }

  return NOT_FOUND_POLICY;
}

/** Apply the same route contract to HTTP responses after route rendering. */
export async function withRouteIndexabilityHeaders(
  request: Request,
  response: Response | Promise<Response>
): Promise<Response> {
  const resolvedResponse = await response;
  const url = new URL(request.url);
  const policy = routeIndexability({
    pathname: url.pathname,
    search: url.searchParams,
    method: request.method,
  });
  const headers = new Headers(resolvedResponse.headers);
  headers.set("X-Robots-Tag", policy.robots);
  headers.set("Referrer-Policy", policy.referrerPolicy);
  if (policy.cacheControl) {
    headers.set("Cache-Control", policy.cacheControl);
  }

  return new Response(resolvedResponse.body, {
    status: resolvedResponse.status,
    statusText: resolvedResponse.statusText,
    headers,
  });
}
