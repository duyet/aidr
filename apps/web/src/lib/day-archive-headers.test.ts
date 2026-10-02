import { describe, expect, it } from "vitest";
import {
  DAY_ARCHIVE_SETTLED_CACHE_CONTROL,
  dayArchiveCacheControl,
} from "./day-archive";
import { withSsrLocaleResponse } from "./locale-response";
import {
  INDEXABLE_ROBOTS,
  withRouteIndexabilityHeaders,
} from "./route-indexability";

/** The Worker's order in src/server.ts: indexability first, then locale. */
async function serve(url: string, routeHeaders: Record<string, string>) {
  const request = new Request(url, { headers: { Accept: "text/html" } });
  const rendered = new Response("<html></html>", {
    status: 200,
    headers: { "Content-Type": "text/html", ...routeHeaders },
  });
  return withSsrLocaleResponse(
    request,
    await withRouteIndexabilityHeaders(request, rendered)
  );
}

describe("day archive response headers", () => {
  it("keeps the long edge cache for a settled day with an explicit ?lang=", async () => {
    // The day route is not a "localized SSR path", so the 60s localized
    // policy must not overwrite the route's own Cache-Control.
    const cache = dayArchiveCacheControl(
      "2026-09-01",
      Date.parse("2026-10-02T03:00:00Z")
    );
    expect(cache).toBe(DAY_ARCHIVE_SETTLED_CACHE_CONTROL);
    const res = await serve("https://aidr.today/date/2026-09-01?lang=en", {
      "Cache-Control": cache,
      "Content-Language": "en",
    });
    expect(res.headers.get("Cache-Control")).toBe(cache);
    expect(res.headers.get("X-Robots-Tag")).toBe(INDEXABLE_ROBOTS);
  });

  it("stays private and varied when the locale came from cookie/headers", async () => {
    const res = await serve("https://aidr.today/date/2026-09-01", {
      "Cache-Control": "private, no-store",
      Vary: "Cookie, Accept-Language",
    });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toContain("Accept-Language");
  });
});
