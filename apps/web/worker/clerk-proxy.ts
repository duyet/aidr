/**
 * Proxy Clerk Frontend API through this Worker so browsers never hit
 * clerk.aidr.today directly. Cloudflare Error 1014 ("DNS points to
 * prohibited IP") blocks CNAMEs from a CF zone to Clerk's CF-hosted FAPI.
 *
 * See https://clerk.com/docs/guides/dashboard/dns-domains/proxy-fapi
 */

import {
  CLERK_PROXY_PATH,
  resolveClerkProxyUrl,
} from "../src/lib/clerk-proxy-config.js";

export { CLERK_PROXY_PATH } from "../src/lib/clerk-proxy-config.js";

/** Upstream Frontend API (Clerk's shared edge — not the broken custom CNAME). */
export const CLERK_FAPI_ORIGIN = "https://frontend-api.clerk.dev";
const APPROVED_CLERK_FAPI_ORIGIN = new URL(CLERK_FAPI_ORIGIN).origin;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_CANONICALIZATION_LAYERS = 8;
const REDIRECT_STATUSES = new Set([300, 301, 302, 303, 305, 307, 308]);
const ABSOLUTE_URL_PATH = /^\/[a-z][a-z\d+.-]*:\/\//i;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "expect",
  "http2-settings",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const REQUEST_HEADER_ALLOWLIST = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "authorization",
  "cache-control",
  "content-type",
  "cookie",
  "dnt",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "if-unmodified-since",
  "origin",
  "pragma",
  "range",
  "referer",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user",
  "user-agent",
  "x-requested-with",
]);
const REQUEST_HEADER_PREFIXES = ["sec-ch-", "x-clerk-", "x-client-"];
const RESPONSE_SENSITIVE_HEADERS = new Set(["clerk-secret-key"]);

export interface ClerkProxyEnv {
  CLERK_SECRET_KEY?: string;
  CLERK_PROXY_URL?: string;
  CLERK_PROXY_TIMEOUT_MS?: string | number;
}

function invalidClerkProxyPath(): never {
  throw new Error("Invalid Clerk proxy path");
}

function invalidPublicProxyUrl(): never {
  throw new Error("Invalid Clerk proxy public URL");
}

function isUnsafeCanonicalPath(path: string): boolean {
  return (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("//") ||
    path.includes("\\") ||
    ABSOLUTE_URL_PATH.test(path)
  );
}

/**
 * Decode only a bounded number of layers. This catches split/nested encodings
 * before any downstream URL parser can reinterpret them as separators.
 */
function assertCanonicalClerkProxyPath(path: string): void {
  let current = path;

  for (let depth = 0; depth < MAX_CANONICALIZATION_LAYERS; depth += 1) {
    if (isUnsafeCanonicalPath(current)) invalidClerkProxyPath();

    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      invalidClerkProxyPath();
    }

    if (decoded === current) return;
    current = decoded;
  }

  // More encoding layers than the bounded canonicalizer are ambiguous.
  invalidClerkProxyPath();
}

function isApprovedClerkTarget(target: URL): boolean {
  return (
    target.origin === APPROVED_CLERK_FAPI_ORIGIN &&
    !target.pathname.startsWith("//") &&
    !target.pathname.includes("\\") &&
    target.username === "" &&
    target.password === ""
  );
}

export function isClerkProxyPath(pathname: string): boolean {
  return (
    pathname === CLERK_PROXY_PATH || pathname.startsWith(`${CLERK_PROXY_PATH}/`)
  );
}

/**
 * Build a target from an absolute, fixed-origin URL. Resolving a path such as
 * `//host` against an origin would let the path replace the origin.
 */
export function buildClerkProxyTarget(request: Request): URL {
  const incoming = new URL(request.url);
  if (!isClerkProxyPath(incoming.pathname)) {
    invalidClerkProxyPath();
  }

  const suffix = incoming.pathname.slice(CLERK_PROXY_PATH.length) || "/";
  assertCanonicalClerkProxyPath(suffix);

  const target = new URL(CLERK_FAPI_ORIGIN);
  target.pathname = suffix;
  target.search = incoming.search;
  target.hash = "";

  if (!isApprovedClerkTarget(target)) invalidClerkProxyPath();
  return target;
}

function publicProxyUrl(env: ClerkProxyEnv): URL {
  const configured = resolveClerkProxyUrl(env.CLERK_PROXY_URL);
  if (!configured) invalidPublicProxyUrl();
  return new URL(configured);
}

function timeoutMs(env: ClerkProxyEnv): number {
  const raw = env.CLERK_PROXY_TIMEOUT_MS;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_TIMEOUT_MS);
}

function isValidIpAddress(value: string | null): value is string {
  if (!value || value !== value.trim() || value.length > 45) return false;
  if (/[\s,;]/.test(value)) return false;

  if (value.includes(":")) {
    try {
      new URL(`http://[${value}]/`);
      return true;
    } catch {
      return false;
    }
  }

  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false;
      const octet = Number(part);
      return octet >= 0 && octet <= 255;
    })
  );
}

function connectionHeaderNames(headers: Headers): Set<string> {
  const names = new Set<string>();
  for (const value of headers.get("connection")?.split(",") ?? []) {
    const name = value.trim().toLowerCase();
    if (/^[!#$%&'*+\-.^_`|~0-9a-z]+$/i.test(name)) names.add(name);
  }
  return names;
}

function shouldForwardRequestHeader(
  name: string,
  connectionNames: Set<string>
): boolean {
  if (
    HOP_BY_HOP_HEADERS.has(name) ||
    connectionNames.has(name) ||
    name === "host" ||
    name === "clerk-proxy-url" ||
    name.includes("secret") ||
    name.startsWith("cf-") ||
    name.startsWith("x-forwarded-")
  ) {
    return false;
  }

  return (
    REQUEST_HEADER_ALLOWLIST.has(name) ||
    REQUEST_HEADER_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

function buildClerkProxyHeaders(
  request: Request,
  env: ClerkProxyEnv,
  publicProxy: URL
): Headers {
  const source = request.headers;
  const connectionNames = connectionHeaderNames(source);
  const headers = new Headers();

  for (const [rawName, value] of source) {
    const name = rawName.toLowerCase();
    if (shouldForwardRequestHeader(name, connectionNames)) {
      headers.append(rawName, value);
    }
  }

  headers.set("Clerk-Proxy-Url", publicProxy.toString());
  headers.set("Clerk-Secret-Key", env.CLERK_SECRET_KEY ?? "");
  headers.set("X-Forwarded-Host", publicProxy.host);
  headers.set("X-Forwarded-Proto", publicProxy.protocol.slice(0, -1));

  const clientIp = source.get("CF-Connecting-IP");
  if (isValidIpAddress(clientIp)) {
    // Cloudflare's ingress header is the only accepted client-IP source.
    headers.set("X-Forwarded-For", clientIp);
  }

  return headers;
}

function buildProxyRequest(
  request: Request,
  target: URL,
  headers: Headers,
  signal: AbortSignal
): Request {
  // Constructing from the incoming Request first preserves streaming bodies
  // in both workerd and Node (where a stream body also needs duplex handling).
  // Vitest covers the Web Fetch surface; a deployed workerd smoke test is still
  // needed for runtime-specific subrequest streaming and abort behavior.
  const routed = new Request(target.toString(), request);
  return new Request(routed, {
    headers,
    redirect: "manual",
    signal,
  });
}

function sanitizeResponseHeaders(source: Headers): Headers {
  const result = new Headers();
  const connectionNames = connectionHeaderNames(source);

  for (const [rawName, value] of source) {
    const name = rawName.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(name) ||
      connectionNames.has(name) ||
      RESPONSE_SENSITIVE_HEADERS.has(name) ||
      name.includes("secret")
    ) {
      continue;
    }
    result.append(rawName, value);
  }

  return result;
}

function rewriteSameOriginRedirect(
  location: string,
  publicProxy: URL
): string | undefined {
  let upstream: URL;
  try {
    upstream = new URL(location, CLERK_FAPI_ORIGIN);
  } catch {
    return undefined;
  }

  if (
    upstream.origin !== APPROVED_CLERK_FAPI_ORIGIN ||
    upstream.username !== "" ||
    upstream.password !== ""
  ) {
    return undefined;
  }

  const rewritten = new URL(publicProxy.toString());
  const basePath = publicProxy.pathname.replace(/\/+$/, "");
  rewritten.pathname = `${basePath}${upstream.pathname === "/" ? "" : upstream.pathname}`;
  rewritten.search = upstream.search;
  rewritten.hash = upstream.hash;

  if (
    rewritten.origin !== publicProxy.origin ||
    rewritten.username !== "" ||
    rewritten.password !== ""
  ) {
    return undefined;
  }

  return rewritten.toString();
}

function cloneUpstreamResponse(response: Response, publicProxy: URL): Response {
  const location = response.headers.get("Location");
  const connectionNames = connectionHeaderNames(response.headers);
  const headers = sanitizeResponseHeaders(response.headers);

  if (REDIRECT_STATUSES.has(response.status) && location) {
    if (connectionNames.has("location")) {
      return new Response("Clerk upstream redirect rejected", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const rewritten = rewriteSameOriginRedirect(location, publicProxy);
    if (!rewritten) {
      return new Response("Clerk upstream redirect rejected", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }
    headers.set("Location", rewritten);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function handleClerkProxy(
  request: Request,
  env: ClerkProxyEnv
): Promise<Response> {
  if (!env.CLERK_SECRET_KEY) {
    return new Response("Clerk proxy misconfigured: missing CLERK_SECRET_KEY", {
      status: 503,
    });
  }

  let publicProxy: URL;
  try {
    publicProxy = publicProxyUrl(env);
  } catch {
    return new Response("Clerk proxy misconfigured: missing CLERK_PROXY_URL", {
      status: 503,
    });
  }

  let target: URL;
  try {
    target = buildClerkProxyTarget(request);
  } catch {
    return new Response("Invalid Clerk proxy path", { status: 400 });
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs(env));

  try {
    const proxyRequest = buildProxyRequest(
      request,
      target,
      buildClerkProxyHeaders(request, env, publicProxy),
      controller.signal
    );
    const response = await fetch(proxyRequest);
    return cloneUpstreamResponse(response, publicProxy);
  } catch {
    return new Response(
      timedOut ? "Clerk upstream timed out" : "Clerk upstream unavailable",
      {
        status: timedOut ? 504 : 502,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}
