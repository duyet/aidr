import { afterEach, describe, expect, it, vi } from "vitest";
import { handleClerkProxy } from "../../worker/clerk-proxy.js";
import {
  canonicalRoutePath,
  INDEXABLE_ROBOTS,
  NOINDEX_FOLLOW_ROBOTS,
  NOINDEX_NOFOLLOW_ROBOTS,
  PRIVATE_CACHE_CONTROL,
  routeIndexability,
  withRouteIndexabilityHeaders,
} from "./route-indexability";
import { articleHead, notFoundHead, routeRobotsMeta } from "./seo";
import { SITE_URL } from "./site";

function metaContent(
  tags: {
    name?: string;
    property?: string;
    content?: string;
    title?: string;
  }[],
  key: string
): string | undefined {
  const hit = tags.find(
    (tag) =>
      tag.name === key || tag.property === key || (key === "title" && tag.title)
  );
  return hit?.content ?? hit?.title;
}

function policyForUrl(path: string, method = "GET") {
  const url = new URL(path, SITE_URL);
  return routeIndexability({
    pathname: url.pathname,
    search: url.searchParams,
    method,
  });
}

describe("routeIndexability", () => {
  it("keeps public base pages, stories, and allowlisted APIs indexable", () => {
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

    for (const pathname of [
      "/api/public",
      "/api/feed",
      "/api/feed/freshness",
      "/api/extension",
      "/api/system",
      "/api/system/overview",
      "/api/og/abcdef12",
      "/api/story/abcdef12",
      "/api/story/abcdef12.md",
    ]) {
      expect(routeIndexability({ pathname })).toMatchObject({
        kind: "api",
        robots: NOINDEX_FOLLOW_ROBOTS,
      });
    }
  });

  it("defaults unknown API routes to private and uncached", () => {
    for (const pathname of [
      "/api/not-allowlisted",
      "/api/feed/freshness/child",
      "/api/subscribe",
      "/__clerk/v1/client",
    ]) {
      expect(routeIndexability({ pathname })).toMatchObject({
        kind: "private",
        robots: NOINDEX_NOFOLLOW_ROBOTS,
        cacheControl: PRIVATE_CACHE_CONTROL,
      });
    }
  });

  it.each(["q", "search", "filter", "utm_source"])(
    "makes unknown query-bearing public HTML noindex, follow: ?%s",
    (param) => {
      expect(
        routeIndexability({
          pathname: "/about",
          search: new URLSearchParams([[param, "value"]]),
        })
      ).toMatchObject({
        kind: "faceted",
        robots: NOINDEX_FOLLOW_ROBOTS,
      });
    }
  );

  it.each([
    "token",
    "access_token",
    "api_key",
    "client_secret",
    "settings",
    "preview",
    "secret",
  ])(
    "treats sensitive query presence as private even when blank: %s",
    (param) => {
      expect(
        routeIndexability({
          pathname: "/",
          search: new URLSearchParams([[param, "   "]]),
        })
      ).toMatchObject({
        kind: "private",
        robots: NOINDEX_NOFOLLOW_ROBOTS,
        cacheControl: PRIVATE_CACHE_CONTROL,
      });
    }
  );

  it("keeps one explicit locale query indexable and rejects locale variants", () => {
    expect(
      routeIndexability({
        pathname: "/mcp",
        search: new URLSearchParams([["lang", "vi"]]),
      })
    ).toMatchObject({ kind: "public", robots: INDEXABLE_ROBOTS });
    expect(
      routeIndexability({
        pathname: "/mcp",
        search: new URLSearchParams([
          ["lang", "vi"],
          ["q", "agents"],
        ]),
      })
    ).toMatchObject({ kind: "faceted", robots: NOINDEX_FOLLOW_ROBOTS });
    for (const search of [
      new URLSearchParams([["locale", "en"]]),
      new URLSearchParams([["lang", "fr"]]),
      new URLSearchParams([
        ["lang", "en"],
        ["lang", "vi"],
      ]),
    ]) {
      expect(routeIndexability({ pathname: "/mcp", search })).toMatchObject({
        kind: "private",
        cacheControl: PRIVATE_CACHE_CONTROL,
      });
    }
  });

  it("allows an explicitly localized subscribe preview to use its API policy", () => {
    expect(
      routeIndexability({
        pathname: "/api/subscribe/preview",
        search: new URLSearchParams([["lang", "en"]]),
      })
    ).toMatchObject({ kind: "api", robots: NOINDEX_FOLLOW_ROBOTS });
    expect(
      routeIndexability({ pathname: "/api/subscribe/preview" })
    ).toMatchObject({ kind: "private" });
  });

  it("makes non-sensitive blank queries noindex without treating them as tokens", () => {
    expect(
      routeIndexability({
        pathname: "/subscribe",
        search: new URLSearchParams([["tab", ""]]),
      })
    ).toMatchObject({ kind: "faceted", robots: NOINDEX_FOLLOW_ROBOTS });
  });

  it("uses the same data-tab parser for whitespace, case, and aliases", () => {
    for (const value of [" admin ", "ADMIN"]) {
      const search = new URLSearchParams([["tab", value]]);
      expect(routeIndexability({ pathname: "/data", search })).toMatchObject({
        kind: "private",
        robots: NOINDEX_NOFOLLOW_ROBOTS,
      });
    }
  });

  it("fails closed for repeated or conflicting data tabs", () => {
    for (const query of [
      "tab=admin&tab=overview",
      "tab=overview&tab=admin",
      "tab=admin&tab=admin",
    ]) {
      expect(
        routeIndexability({
          pathname: "/data",
          search: new URLSearchParams(query),
        })
      ).toMatchObject({ kind: "faceted", robots: NOINDEX_FOLLOW_ROBOTS });
    }
  });

  it.each([
    ["/%73ign-in/account", "private"],
    ["/%61pi/%61dmin/items", "private"],
    ["/%73ubscribe", "public"],
    ["/api/%73ubscribe/preview", "private"],
    ["/api/%6dcp", "private"],
    ["/%61bcdef12", "public"],
  ] as const)("classifies encoded path alias %s", (path, kind) => {
    expect(policyForUrl(path).kind).toBe(kind);
  });

  it("classifies encoded subscribe settings as private", () => {
    expect(
      policyForUrl("/%73ubscribe?settings=subscriber-token")
    ).toMatchObject({
      kind: "private",
      robots: NOINDEX_NOFOLLOW_ROBOTS,
    });
  });

  it("rejects encoded separators and duplicate path separators", () => {
    expect(canonicalRoutePath("/%61bout")).toBe("/about");
    expect(canonicalRoutePath("/%73ign%2Fin")).toBeNull();
    expect(canonicalRoutePath("/about//alias")).toBeNull();
    expect(policyForUrl("/%73ign%2Fin")).toMatchObject({
      kind: "private",
      cacheControl: PRIVATE_CACHE_CONTROL,
    });
  });

  it("keeps unknown HTML routes noindex and uncached", () => {
    expect(routeIndexability({ pathname: "/missing-page" })).toMatchObject({
      kind: "not-found",
      robots: NOINDEX_FOLLOW_ROBOTS,
      cacheControl: PRIVATE_CACHE_CONTROL,
    });
  });
});

/**
 * Node Vitest does not boot TanStack Start's workerd SSR runtime. These tests
 * use the production route head builders and the final Worker response
 * wrapper, which is the behavior available without a Cloudflare local worker.
 */
describe("story response indexability", () => {
  const item = {
    id: "abcdef12deadbeef",
    title: "Published story",
    summary: "A published story summary.",
    image_url: null,
    category: "Research",
  };
  const canonical = `${SITE_URL}/abcdef12?lang=vi`;

  async function responseForStory(
    path: string,
    status: number,
    head: ReturnType<typeof articleHead> | ReturnType<typeof notFoundHead>
  ) {
    const response = await withRouteIndexabilityHeaders(
      new Request(`${SITE_URL}${path}`),
      new Response(status === 200 ? "story" : "missing", {
        status,
        headers: { "Cache-Control": "public, max-age=300" },
      })
    );
    return {
      head,
      response,
      meta: [...head.meta, routeRobotsMeta({ pathname: path, status })],
    };
  }

  it("keeps a valid story indexable, cached, and canonical", async () => {
    const { head, response, meta } = await responseForStory(
      "/abcdef12",
      200,
      articleHead(item)
    );

    expect(response.status).toBe(200);
    expect(metaContent(meta, "robots")).toBe(INDEXABLE_ROBOTS);
    expect(response.headers.get("X-Robots-Tag")).toBe(INDEXABLE_ROBOTS);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(head.links).toContainEqual({ rel: "canonical", href: canonical });
  });

  it.each(["missing", "unpublished"])(
    "makes a %s story response 404, noindex, and uncached",
    async (state) => {
      const title =
        state === "unpublished" ? "Unpublished story" : "Page not found";
      const { head, response, meta } = await responseForStory(
        "/abcdef12",
        404,
        notFoundHead(`${title} | AI News`)
      );

      expect(response.status).toBe(404);
      expect(metaContent(meta, "robots")).toBe(NOINDEX_FOLLOW_ROBOTS);
      expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_FOLLOW_ROBOTS);
      expect(response.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL);
      expect(head.links.some((link) => link.rel === "canonical")).toBe(false);
    }
  );

  it("overrides a public policy on a final server error", async () => {
    const response = await withRouteIndexabilityHeaders(
      new Request(`${SITE_URL}/about`),
      new Response("down", {
        status: 503,
        headers: { "Cache-Control": "public, max-age=300" },
      })
    );
    const meta = routeRobotsMeta({ pathname: "/about", status: 503 });

    expect(response.status).toBe(503);
    expect(meta).toEqual({ name: "robots", content: NOINDEX_FOLLOW_ROBOTS });
    expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_FOLLOW_ROBOTS);
    expect(response.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL);
  });
});

describe("withRouteIndexabilityHeaders", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mirrors indexability without downgrading a public cache", async () => {
    const response = await withRouteIndexabilityHeaders(
      new Request(`${SITE_URL}/about`),
      new Response("ok", {
        headers: { "Cache-Control": "public, max-age=60" },
      })
    );

    expect(response.headers.get("X-Robots-Tag")).toBe(INDEXABLE_ROBOTS);
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("mirrors a faceted noindex policy and preserves its public cache", async () => {
    const response = await withRouteIndexabilityHeaders(
      new Request(`${SITE_URL}/?utm_source=newsletter`),
      new Response("results", {
        headers: { "Cache-Control": "public, max-age=60" },
      })
    );

    expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_FOLLOW_ROBOTS);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("overrides public caching for tokenized and unknown API responses", async () => {
    for (const path of [
      "/api/subscribe?token=secret",
      "/api/not-allowlisted",
    ]) {
      const response = await withRouteIndexabilityHeaders(
        new Request(`${SITE_URL}${path}`),
        new Response("private", {
          headers: { "Cache-Control": "public, max-age=300" },
        })
      );

      expect(response.headers.get("X-Robots-Tag")).toBe(
        NOINDEX_NOFOLLOW_ROBOTS
      );
      expect(response.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL);
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    }
  });

  it("applies private headers to encoded route aliases", async () => {
    for (const path of [
      "/%73ign-in/account",
      "/%61pi/%61dmin/items",
      "/%73ubscribe?settings=token",
      "/api/%73ubscribe/preview",
      "/api/%6dcp",
    ]) {
      const response = await withRouteIndexabilityHeaders(
        new Request(`${SITE_URL}${path}`),
        new Response("private", {
          headers: { "Cache-Control": "public, max-age=300" },
        })
      );

      expect(response.headers.get("X-Robots-Tag")).toBe(
        NOINDEX_NOFOLLOW_ROBOTS
      );
      expect(response.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL);
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    }
  });

  it("allowlists feed freshness as a cacheable noindex API", async () => {
    const response = await withRouteIndexabilityHeaders(
      new Request(`${SITE_URL}/api/feed/freshness`),
      new Response('{"freshness":"ok"}', {
        headers: { "Cache-Control": "public, max-age=60, s-maxage=120" },
      })
    );

    expect(
      routeIndexability({ pathname: "/api/feed/freshness" })
    ).toMatchObject({
      kind: "api",
      robots: NOINDEX_FOLLOW_ROBOTS,
    });
    expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_FOLLOW_ROBOTS);
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=60, s-maxage=120"
    );
  });

  it("keeps an encoded whitespace admin data tab private in meta and headers", async () => {
    const url = new URL("/data?tab=%20admin", SITE_URL);
    const response = await withRouteIndexabilityHeaders(
      new Request(url),
      new Response("admin view", {
        headers: { "Cache-Control": "public, max-age=300" },
      })
    );
    const meta = routeRobotsMeta({
      pathname: url.pathname,
      search: url.searchParams,
    });

    expect(meta).toEqual({
      name: "robots",
      content: NOINDEX_NOFOLLOW_ROBOTS,
    });
    expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_NOFOLLOW_ROBOTS);
    expect(response.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("keeps PR #149 Markdown responses noindex, follow, and cacheable", async () => {
    const response = await withRouteIndexabilityHeaders(
      new Request(`${SITE_URL}/api/story/abcdef12.md?lang=en`),
      new Response("# story", {
        headers: {
          "Cache-Control": "public, max-age=300",
          Link: `<${SITE_URL}/abcdef12>; rel="canonical"`,
        },
      })
    );

    expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_FOLLOW_ROBOTS);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(response.headers.get("Link")).toContain(`${SITE_URL}/abcdef12`);
  });
});

describe("Clerk proxy indexability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function proxyRequest(path = "/__clerk/v1/client"): Request {
    return new Request(`${SITE_URL}${path}`);
  }

  async function wrapProxyResponse(
    response: Response,
    request = proxyRequest(),
    env = { CLERK_SECRET_KEY: "server-secret" }
  ) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    return withRouteIndexabilityHeaders(
      request,
      handleClerkProxy(request, env)
    );
  }

  it("wraps a successful proxy response as private", async () => {
    const response = await wrapProxyResponse(
      new Response("ok", { headers: { "Cache-Control": "public, max-age=60" } })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_NOFOLLOW_ROBOTS);
    expect(response.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("preserves a proxy redirect while applying private headers", async () => {
    const response = await wrapProxyResponse(
      new Response(null, {
        status: 302,
        headers: { Location: "https://frontend-api.clerk.dev/v1/next" },
      })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://frontend-api.clerk.dev/v1/next"
    );
    expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_NOFOLLOW_ROBOTS);
  });

  it("wraps a proxy misconfiguration error without caching it", async () => {
    const request = proxyRequest();
    const response = await withRouteIndexabilityHeaders(
      request,
      handleClerkProxy(request, {})
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_NOFOLLOW_ROBOTS);
    expect(response.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL);
  });

  it("wraps malformed proxy and upstream error responses", async () => {
    for (const [upstream, request, expectedStatus] of [
      [
        new Response("bad gateway", { status: 502, statusText: "Bad Gateway" }),
        proxyRequest(),
        502,
      ],
      [Response.error(), proxyRequest(), 502],
      [
        new Response("invalid path", { status: 400 }),
        proxyRequest("/__clerk/%zz"),
        400,
      ],
    ] as const) {
      const response = await wrapProxyResponse(upstream, request);

      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get("X-Robots-Tag")).toBe(
        NOINDEX_NOFOLLOW_ROBOTS
      );
      expect(response.headers.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL);
    }
  });
});
