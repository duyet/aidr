import { describe, expect, it } from "vitest";
import { HOMEPAGE_CACHE_CONTROL, withHomepageHeaders } from "./agent-discovery";
import { SITE_URL } from "./site";

/**
 * The homepage Cache-Control stamp exists so the SSR feed is edge-cached
 * deterministically. The dangerous failure mode is stamping a public
 * max-age onto something that must not be cached — an error page, or a
 * response that already declared its own policy.
 */
describe("withHomepageHeaders cache safety", () => {
  it("marks homepage errors private and no-store", () => {
    const res = withHomepageHeaders(
      new Request(`${SITE_URL}/`),
      new Response("boom", { status: 500 })
    );
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toBe("Cookie, Accept-Language");
    // Discovery links are still safe to advertise on an error page.
    expect(res.headers.get("Link")).toContain("api-catalog");
  });

  it("does not downgrade an upstream private/no-store policy", () => {
    const res = withHomepageHeaders(
      new Request(`${SITE_URL}/`),
      new Response("ok", {
        headers: { "Cache-Control": "private, no-store" },
      })
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("downgrades an unsafe public policy on a bare homepage", () => {
    const res = withHomepageHeaders(
      new Request(`${SITE_URL}/`),
      new Response("ok", { headers: { "Cache-Control": "public, max-age=60" } })
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("leaves non-homepage responses completely untouched", () => {
    const upstream = new Response("feed", {
      headers: { "Cache-Control": "no-store" },
    });
    const res = withHomepageHeaders(
      new Request(`${SITE_URL}/api/feed`),
      upstream
    );
    // Same object — no header copying, no accidental stamping.
    expect(res).toBe(upstream);
  });

  it("keeps a cookie/Accept-Language-selected bare homepage private", () => {
    const res = withHomepageHeaders(
      new Request(`${SITE_URL}/`),
      new Response("ok")
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toBe("Cookie, Accept-Language");
  });

  it("stamps the deterministic TTL on an explicit locale homepage", () => {
    const res = withHomepageHeaders(
      new Request(`${SITE_URL}/?lang=en`),
      new Response("ok")
    );
    expect(res.headers.get("Cache-Control")).toBe(HOMEPAGE_CACHE_CONTROL);
    expect(res.headers.get("Content-Language")).toBe("en");
    expect(res.headers.get("Vary")).toBeNull();
  });

  it("does not publicly cache an unsupported locale value", () => {
    const res = withHomepageHeaders(
      new Request(`${SITE_URL}/?lang=fr`),
      new Response("ok")
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
