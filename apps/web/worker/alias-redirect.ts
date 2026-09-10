import { SITE_URL } from "../src/lib/site.js";

/** Hosts that must 308 to the canonical origin, keeping path and query. */
export const ALIAS_HOSTS = new Set(["news.duyet.net", "www.news.duyet.net"]);

export function aliasHost(request: Request): string {
  const url = new URL(request.url);
  const raw = request.headers.get("Host") ?? url.host;
  return raw.split(":")[0]?.toLowerCase() ?? "";
}

/**
 * Path-preserving canonical redirect for news.duyet.net.
 * aidr.today (and any other host) returns null — no loop.
 */
export function aliasRedirect(request: Request): Response | null {
  const host = aliasHost(request);
  if (!ALIAS_HOSTS.has(host)) return null;
  const url = new URL(request.url);
  let pathname = url.pathname || "/";
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  const location = `${SITE_URL}${pathname}${url.search}`;
  return new Response(null, {
    status: 308,
    headers: { Location: location },
  });
}
