/**
 * Proxy Clerk Frontend API through this Worker so browsers never hit
 * clerk.aidr.today directly. Cloudflare Error 1014 ("DNS points to
 * prohibited IP") blocks CNAMEs from a CF zone to Clerk's CF-hosted FAPI.
 *
 * See https://clerk.com/docs/guides/dashboard/dns-domains/proxy-fapi
 */

export const CLERK_PROXY_PATH = "/__clerk";
export const CLERK_PROXY_URL = "https://aidr.today/__clerk";
/** Upstream Frontend API (Clerk's shared edge — not the broken custom CNAME). */
export const CLERK_FAPI_ORIGIN = "https://frontend-api.clerk.dev";
const APPROVED_CLERK_FAPI_ORIGIN = new URL(CLERK_FAPI_ORIGIN).origin;
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;
const ABSOLUTE_URL_PATH = /^\/[a-z][a-z\d+.-]*:\/\//i;

function invalidClerkProxyPath(): never {
  throw new Error("Invalid Clerk proxy path");
}

function hasNestedEncodedSeparator(path: string): boolean {
  let candidate = path;

  // Decode only the percent sign so nested encodings such as %252f cannot
  // turn into a separator after a proxy or framework decodes them once more.
  for (let depth = 0; depth < 8; depth += 1) {
    if (ENCODED_PATH_SEPARATOR.test(candidate)) return true;
    const next = candidate.replace(/%25/gi, "%");
    if (next === candidate) return false;
    candidate = next;
  }

  // A path with more than eight encoding layers is ambiguous. Fail closed.
  return /%25|%2f|%5c/i.test(candidate);
}

function assertSafeClerkProxySuffix(suffix: string): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(suffix);
  } catch {
    invalidClerkProxyPath();
  }

  if (
    !suffix.startsWith("/") ||
    suffix.startsWith("//") ||
    suffix.includes("\\") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    ABSOLUTE_URL_PATH.test(decoded) ||
    hasNestedEncodedSeparator(suffix)
  ) {
    invalidClerkProxyPath();
  }
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
  assertSafeClerkProxySuffix(suffix);

  const target = new URL(CLERK_FAPI_ORIGIN);
  target.pathname = suffix;
  target.search = incoming.search;
  target.hash = "";

  if (
    target.origin !== APPROVED_CLERK_FAPI_ORIGIN ||
    target.pathname.startsWith("//") ||
    target.pathname.includes("\\") ||
    target.username !== "" ||
    target.password !== ""
  ) {
    invalidClerkProxyPath();
  }

  return target;
}

export async function handleClerkProxy(
  request: Request,
  env: { CLERK_SECRET_KEY?: string }
): Promise<Response> {
  if (!env.CLERK_SECRET_KEY) {
    return new Response("Clerk proxy misconfigured: missing CLERK_SECRET_KEY", {
      status: 503,
    });
  }

  let target: URL;
  try {
    target = buildClerkProxyTarget(request);
  } catch {
    return new Response("Invalid Clerk proxy path", { status: 400 });
  }

  const headers = new Headers(request.headers);
  headers.set("Clerk-Proxy-Url", CLERK_PROXY_URL);
  headers.set("Clerk-Secret-Key", env.CLERK_SECRET_KEY);
  headers.set(
    "X-Forwarded-For",
    request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      ""
  );
  // Avoid leaking the browser Host to Clerk's shared FAPI.
  headers.delete("host");

  const proxyReq = new Request(target.toString(), {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "manual",
  });

  return fetch(proxyReq);
}
