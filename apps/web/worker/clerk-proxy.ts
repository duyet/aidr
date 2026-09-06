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

export function isClerkProxyPath(pathname: string): boolean {
  return (
    pathname === CLERK_PROXY_PATH || pathname.startsWith(`${CLERK_PROXY_PATH}/`)
  );
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

  const incoming = new URL(request.url);
  const suffix = incoming.pathname.slice(CLERK_PROXY_PATH.length) || "/";
  const target = new URL(suffix + incoming.search, CLERK_FAPI_ORIGIN);

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
