import { SLUG_RE } from "../src/lib/analytics/schema";
import { CHROME_WEB_STORE_URL } from "../src/lib/site";

const DEFAULT_SOURCE = "video";

/** `/c?s=<source>` sends readers to the store listing. The store console
 *  attributes installs by `utm_source`, and the 302 itself lands in Cloudflare
 *  request logs; a Worker redirect has no page to fire a browser event from. */
export function chromeShortLinkTarget(requestUrl: string): string {
  const raw = new URL(requestUrl).searchParams.get("s")?.trim() ?? "";
  const source = SLUG_RE.test(raw) ? raw.toLowerCase() : DEFAULT_SOURCE;
  const target = new URL(CHROME_WEB_STORE_URL);
  target.searchParams.set("utm_source", source);
  target.searchParams.set("utm_medium", "short_link");
  target.searchParams.set("utm_campaign", "chrome_extension");
  return target.toString();
}

export function chromeShortLinkResponse(request: Request): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: chromeShortLinkTarget(request.url),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
