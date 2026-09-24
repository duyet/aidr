import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  INDEXABLE_ROBOTS,
  NOINDEX_FOLLOW_ROBOTS,
  NOINDEX_NOFOLLOW_ROBOTS,
  PRIVATE_CACHE_CONTROL,
  routeIndexability,
  withRouteIndexabilityHeaders,
} from "./route-indexability";
import { SITE_URL } from "./site";

const here = dirname(fileURLToPath(import.meta.url));

describe("routeIndexability", () => {
  it("keeps the public base page contracts indexable", () => {
    for (const pathname of [
      "/",
      "/abcdef12",
      "/about",
      "/data",
      "/subscribe",
    ]) {
      expect(routeIndexability({ pathname })).toMatchObject({
        kind: "public",
        robots: INDEXABLE_ROBOTS,
      });
    }
  });

  it.each(["q", "tag", "category", "aidr"])(
    "keeps homepage ?%s variants out of the index but crawlable",
    (param) => {
      expect(
        routeIndexability({
          pathname: "/",
          search: { [param]: "value" },
        })
      ).toMatchObject({
        kind: "faceted",
        robots: NOINDEX_FOLLOW_ROBOTS,
      });
    }
  );

  it("treats subscribe tabs and feed filters as faceted", () => {
    expect(
      routeIndexability({ pathname: "/subscribe", search: { tab: "email" } })
    ).toMatchObject({ kind: "faceted", robots: NOINDEX_FOLLOW_ROBOTS });
    expect(
      routeIndexability({
        pathname: "/api/feed",
        search: { before: "2026-09-01" },
      })
    ).toMatchObject({ kind: "faceted", robots: NOINDEX_FOLLOW_ROBOTS });
  });

  it.each([
    "/mail",
    "/sign-in/account-portal",
    "/sign-up/account-portal",
    "/data?tab=admin",
    "/subscribe?settings=subscriber-token",
    "/subscribe?unsubscribe=subscriber-token",
    "/api/mcp",
    "/api/admin/items",
    "/api/subscribe/preview",
    "/api/subscribe?token=subscriber-token",
  ])("fails private/admin/tokenized routes closed: %s", (path) => {
    const url = new URL(path, SITE_URL);
    expect(
      routeIndexability({ pathname: url.pathname, search: url.searchParams })
    ).toMatchObject({
      kind: "private",
      robots: NOINDEX_NOFOLLOW_ROBOTS,
      referrerPolicy: "no-referrer",
      cacheControl: PRIVATE_CACHE_CONTROL,
    });
  });

  it("treats subscription mutations as private even without a token", () => {
    expect(
      routeIndexability({ pathname: "/api/subscribe", method: "POST" })
    ).toMatchObject({
      kind: "private",
      cacheControl: PRIVATE_CACHE_CONTROL,
    });
  });

  it("keeps operational APIs non-indexable without disabling public caching", () => {
    const policy = routeIndexability({ pathname: "/api/system/overview" });
    expect(policy).toMatchObject({
      kind: "operational",
      robots: NOINDEX_NOFOLLOW_ROBOTS,
    });
    expect(policy.cacheControl).toBeUndefined();
  });

  it("keeps unknown HTML routes noindex and uncached", () => {
    expect(routeIndexability({ pathname: "/missing-page" })).toMatchObject({
      kind: "not-found",
      robots: NOINDEX_FOLLOW_ROBOTS,
      cacheControl: PRIVATE_CACHE_CONTROL,
    });
  });
});

describe("withRouteIndexabilityHeaders", () => {
  it("mirrors indexability without downgrading a public cache", async () => {
    const cacheControl = "public, max-age=60";
    const response = await withRouteIndexabilityHeaders(
      new Request(`${SITE_URL}/about`),
      new Response("ok", { headers: { "Cache-Control": cacheControl } })
    );

    expect(response.headers.get("X-Robots-Tag")).toBe(INDEXABLE_ROBOTS);
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(response.headers.get("Cache-Control")).toBe(cacheControl);
  });

  it("mirrors a faceted noindex policy and preserves its public cache", async () => {
    const response = await withRouteIndexabilityHeaders(
      new Request(`${SITE_URL}/?q=agents`),
      new Response("results", {
        headers: { "Cache-Control": "public, max-age=60" },
      })
    );

    expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_FOLLOW_ROBOTS);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("overrides public caching for tokenized responses", async () => {
    const response = await withRouteIndexabilityHeaders(
      new Request(`${SITE_URL}/api/subscribe?token=secret`),
      new Response("private", {
        headers: { "Cache-Control": "public, max-age=300" },
      })
    );

    expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_NOFOLLOW_ROBOTS);
    expect(response.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("wraps rendered Start and API responses in the server entry", () => {
    const source = readFileSync(join(here, "../server.ts"), "utf8");
    expect(source).toContain("withRouteIndexabilityHeaders(");
  });
});
