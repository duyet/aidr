import { describe, expect, it } from "vitest";
import {
  LOCALE_PRIVATE_CACHE_CONTROL,
  normalizeLocaleRequest,
  SSR_LOCALIZED_CACHE_CONTROL,
  SSR_NEUTRAL_CACHE_CONTROL,
  withSsrLocaleResponse,
} from "./locale-response";
import {
  INDEXABLE_ROBOTS,
  NOINDEX_FOLLOW_ROBOTS,
  NOINDEX_NOFOLLOW_ROBOTS,
  withRouteIndexabilityHeaders,
} from "./route-indexability";
import { routeRobotsMeta } from "./seo";

function html(status = 200): Response {
  return new Response("<html></html>", {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

describe("normalizeLocaleRequest", () => {
  it("redirects one valid legacy alias with temporary private headers", () => {
    const response = normalizeLocaleRequest(
      new Request("https://aidr.today/mcp?locale=en&utm_source=agent"),
      { format: "html" }
    );
    expect(response?.status).toBe(307);
    expect(response?.headers.get("Location")).toBe(
      "https://aidr.today/mcp?utm_source=agent&lang=en"
    );
    expect(response?.headers.get("Cache-Control")).toBe(
      LOCALE_PRIVATE_CACHE_CONTROL
    );
    expect(response?.headers.get("Vary")).toContain("Accept-Language");
  });

  it("persists an explicit locale when canonicalizing a neutral URL", () => {
    const response = normalizeLocaleRequest(
      new Request("https://aidr.today/about?lang=en"),
      { format: "html", neutralPath: true }
    );
    expect(response?.status).toBe(307);
    expect(response?.headers.get("Set-Cookie")).toContain("news_lang=en;");
    expect(response?.headers.get("Cache-Control")).toBe(
      LOCALE_PRIVATE_CACHE_CONTROL
    );
  });

  it("can canonicalize a legacy alias while changing compatibility paths", () => {
    const response = normalizeLocaleRequest(
      new Request("https://aidr.today/extension?locale=en&utm_source=chrome"),
      { format: "html", redirectPath: "/subscribe" }
    );
    expect(response?.status).toBe(307);
    expect(response?.headers.get("Location")).toBe(
      "https://aidr.today/subscribe?utm_source=chrome&lang=en"
    );
    expect(response?.headers.get("Cache-Control")).toBe(
      LOCALE_PRIVATE_CACHE_CONTROL
    );
  });

  it("validates without redirecting when redirects are disabled", () => {
    expect(
      normalizeLocaleRequest(
        new Request("https://aidr.today/contribute/new?locale=vi"),
        { format: "json", allowRedirect: false }
      )
    ).toBeNull();

    const invalid = normalizeLocaleRequest(
      new Request("https://aidr.today/contribute/new?lang=fr"),
      { format: "json", allowRedirect: false }
    );
    expect(invalid?.status).toBe(400);
    expect(invalid?.headers.get("content-type")).toContain("application/json");
  });

  it("does not send a scheme-relative pathname to another origin", () => {
    for (const url of [
      "https://aidr.today//evil.example?locale=en",
      "https://aidr.today/\\evil.example?locale=en",
    ]) {
      const response = normalizeLocaleRequest(new Request(url), {
        format: "html",
      });
      expect(response?.status).toBe(400);
      expect(response?.headers.get("Location")).toBeNull();
      expect(response?.headers.get("Cache-Control")).toBe(
        LOCALE_PRIVATE_CACHE_CONTROL
      );
      expect(response?.headers.get("Content-Language")).toBe("en, vi");
      expect(response?.headers.get("Vary")).toContain("Cookie");
      expect(response?.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(response?.headers.get("Referrer-Policy")).toBe("no-referrer");
    }
  });

  it.each([
    ["/", "https://aidr.today/?lang=en"],
    ["/abcdef12", "https://aidr.today/abcdef12?lang=en"],
    ["/date/2026-10-02", "https://aidr.today/date/2026-10-02?lang=en"],
  ])("redirects a legacy locale on %s to the same origin", (path, location) => {
    const response = normalizeLocaleRequest(
      new Request(`https://aidr.today${path}?locale=en`),
      { format: "html" }
    );
    expect(response?.status).toBe(307);
    expect(response?.headers.get("Location")).toBe(location);
    expect(response?.headers.get("Cache-Control")).toBe(
      LOCALE_PRIVATE_CACHE_CONTROL
    );
  });

  it("rejects repeated, conflicting, and invalid values", () => {
    for (const search of [
      "?lang=en&lang=vi",
      "?lang=en&locale=vi",
      "?lang=unsupported",
    ]) {
      const response = normalizeLocaleRequest(
        new Request(`https://aidr.today/api/feed${search}`),
        { format: "json" }
      );
      expect(response?.status).toBe(400);
      expect(response?.headers.get("Cache-Control")).toBe(
        LOCALE_PRIVATE_CACHE_CONTROL
      );
      expect(response?.headers.get("Content-Language")).toBe("en, vi");
      expect(response?.headers.get("Vary")).toContain("Cookie");
      expect(response?.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(response?.headers.get("Referrer-Policy")).toBe("no-referrer");
    }
  });
});

describe("withSsrLocaleResponse", () => {
  it.each(["/mcp", "/subscribe", "/changelog", "/contribute/new"])(
    "applies the explicit-locale cache policy to %s",
    (path) => {
      const response = withSsrLocaleResponse(
        new Request(`https://aidr.today${path}?lang=vi`),
        html()
      );
      expect(response.headers.get("Content-Language")).toBe("vi");
      expect(response.headers.get("Cache-Control")).toBe(
        SSR_LOCALIZED_CACHE_CONTROL
      );
      expect(response.headers.get("Vary")).toBeNull();
    }
  );

  it("keeps bare localized pages private and varied without a robots verdict", () => {
    const response = withSsrLocaleResponse(
      new Request("https://aidr.today/mcp", {
        headers: { cookie: "news_lang=en" },
      }),
      html()
    );
    expect(response.headers.get("Content-Language")).toBe("en");
    expect(response.headers.get("Cache-Control")).toBe(
      LOCALE_PRIVATE_CACHE_CONTROL
    );
    expect(response.headers.get("Vary")).toBe("Cookie, Accept-Language");
    // The locale layer is cache policy only. Indexability belongs to
    // routeIndexability (X-Robots-Tag + <meta name="robots">), so this layer
    // must not stamp a second, possibly different, verdict (#223).
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("keeps authenticated child routes private, English, and varied", () => {
    for (const path of [
      "/sign-in/account?lang=vi",
      "/sign-up/verify?lang=vi",
    ]) {
      const response = withSsrLocaleResponse(
        new Request(`https://aidr.today${path}`),
        html()
      );
      expect(response.headers.get("Content-Language")).toBe("en");
      expect(response.headers.get("Cache-Control")).toBe(
        LOCALE_PRIVATE_CACHE_CONTROL
      );
      expect(response.headers.get("Vary")).toBe("Cookie, Accept-Language");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
  });

  it("keeps tokenized subscribe and mail surfaces private", () => {
    for (const path of [
      "/subscribe?lang=en&unsubscribe=secret-token",
      "/mail?lang=vi",
    ]) {
      const response = withSsrLocaleResponse(
        new Request(`https://aidr.today${path}`),
        html()
      );
      expect(response.headers.get("Cache-Control")).toBe(
        LOCALE_PRIVATE_CACHE_CONTROL
      );
      expect(response.headers.get("Vary")).toContain("Cookie");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
  });

  it("keeps language-neutral pages English, public, and always varied", () => {
    const response = withSsrLocaleResponse(
      new Request("https://aidr.today/about"),
      html()
    );
    expect(response.headers.get("Content-Language")).toBe("en");
    expect(response.headers.get("Cache-Control")).toBe(
      SSR_NEUTRAL_CACHE_CONTROL
    );
    expect(response.headers.get("Vary")).toBe("Cookie, Accept-Language");

    const selected = withSsrLocaleResponse(
      new Request("https://aidr.today/about", {
        headers: { cookie: "news_lang=en" },
      }),
      html()
    );
    expect(selected.headers.get("Cache-Control")).toBe(
      SSR_NEUTRAL_CACHE_CONTROL
    );
    expect(selected.headers.get("Vary")).toBe("Cookie, Accept-Language");
  });

  it.each([
    "/",
    "/changelog",
    "/mcp",
    "/contribute/new",
    "/subscribe",
    "/abcdef12",
  ])("covers localized SSR route %s", (path) => {
    const response = withSsrLocaleResponse(
      new Request(`https://aidr.today${path}?lang=en`),
      html()
    );
    expect(response.headers.get("Content-Language")).toBe("en");
    expect(response.headers.get("Cache-Control")).toBe(
      SSR_LOCALIZED_CACHE_CONTROL
    );
    expect(response.headers.get("Vary")).toBeNull();
  });

  it.each(["/about", "/brand", "/data", "/privacy", "/terms"])(
    "covers language-neutral SSR route %s",
    (path) => {
      const response = withSsrLocaleResponse(
        new Request(`https://aidr.today${path}`),
        html()
      );
      expect(response.headers.get("Content-Language")).toBe("en");
      expect(response.headers.get("Cache-Control")).toBe(
        SSR_NEUTRAL_CACHE_CONTROL
      );
      expect(response.headers.get("Vary")).toBe("Cookie, Accept-Language");
    }
  );

  it("marks SSR errors and redirects private, no-store, and varied", () => {
    const notFound = withSsrLocaleResponse(
      new Request("https://aidr.today/mcp?lang=vi"),
      html(404)
    );
    expect(notFound.headers.get("Cache-Control")).toBe(
      LOCALE_PRIVATE_CACHE_CONTROL
    );
    expect(notFound.headers.get("Vary")).toBe("Cookie, Accept-Language");

    const redirect = withSsrLocaleResponse(
      new Request("https://aidr.today/abcdef12"),
      new Response(null, {
        status: 307,
        headers: { Location: "https://aidr.today/abcdef12?lang=vi" },
      })
    );
    expect(redirect.headers.get("Cache-Control")).toBe(
      LOCALE_PRIVATE_CACHE_CONTROL
    );
    expect(redirect.headers.get("Content-Language")).toBe("vi");
    expect(redirect.headers.get("Vary")).toBe("Cookie, Accept-Language");
    expect(redirect.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(redirect.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});

/**
 * The two Worker response wrappers, applied in production order (src/server.ts
 * runs withRouteIndexabilityHeaders first, withSsrLocaleResponse last). Robots
 * policy is decided once, by routeIndexability: the header it stamps and the
 * `<meta name="robots">` the root route renders come from the same function, so
 * they cannot drift — and the locale layer can no longer overrule either (#223).
 */
describe("SSR indexability contract", () => {
  async function documentResponse(
    path: string,
    init: RequestInit & { status?: number } = {}
  ): Promise<{ request: Request; response: Response }> {
    const { status = 200, ...requestInit } = init;
    const request = new Request(`https://aidr.today${path}`, requestInit);
    const response = withSsrLocaleResponse(
      request,
      await withRouteIndexabilityHeaders(request, html(status))
    );
    return { request, response };
  }

  /** The robots directive the rendered document would carry in its <head>. */
  function metaRobots(request: Request, status = 200): string | undefined {
    const url = new URL(request.url);
    const meta = routeRobotsMeta({
      pathname: url.pathname,
      search: url.searchParams,
      status,
    });
    return "content" in meta ? meta.content : undefined;
  }

  it.each<{ path: string; headers: Record<string, string> }>([
    { path: "/", headers: {} },
    { path: "/abcdef12", headers: {} },
    { path: "/abcdef12", headers: { cookie: "news_lang=en" } },
    {
      path: "/mcp",
      headers: { "accept-language": "en-US,en;q=0.9" },
    },
  ])(
    "keeps bare $path indexable while private and varied",
    async ({ path, headers }) => {
      const { request, response } = await documentResponse(path, { headers });
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Robots-Tag")).toBe(INDEXABLE_ROBOTS);
      expect(response.headers.get("Cache-Control")).toBe(
        LOCALE_PRIVATE_CACHE_CONTROL
      );
      expect(response.headers.get("Vary")).toBe("Cookie, Accept-Language");
      expect(metaRobots(request)).toBe(response.headers.get("X-Robots-Tag"));
    }
  );

  it("caches an explicit-lang submit document and keeps the bare one private", async () => {
    const explicit = await documentResponse("/contribute/new?lang=en");
    expect(explicit.response.headers.get("Content-Language")).toBe("en");
    expect(explicit.response.headers.get("Cache-Control")).toBe(
      SSR_LOCALIZED_CACHE_CONTROL
    );
    expect(explicit.response.headers.get("Vary")).toBeNull();
    expect(explicit.response.headers.get("X-Robots-Tag")).toBe(
      NOINDEX_FOLLOW_ROBOTS
    );

    const bare = await documentResponse("/contribute/new", {
      headers: { cookie: "news_lang=en" },
    });
    expect(bare.response.headers.get("Cache-Control")).toBe(
      LOCALE_PRIVATE_CACHE_CONTROL
    );
    expect(bare.response.headers.get("Vary")).toBe("Cookie, Accept-Language");
    expect(bare.response.headers.get("Content-Language")).toBe("en");
  });

  it.each(["/?lang=vi", "/?lang=en", "/abcdef12?lang=en", "/mcp?lang=vi"])(
    "keeps explicit-locale %s indexable and publicly cacheable",
    async (path) => {
      const { request, response } = await documentResponse(path);
      expect(response.headers.get("X-Robots-Tag")).toBe(INDEXABLE_ROBOTS);
      expect(response.headers.get("Cache-Control")).toBe(
        SSR_LOCALIZED_CACHE_CONTROL
      );
      expect(response.headers.get("Vary")).toBeNull();
      expect(metaRobots(request)).toBe(response.headers.get("X-Robots-Tag"));
    }
  );

  it.each([
    "/mail",
    "/sign-in/account?lang=vi",
    "/sign-up/verify?lang=vi",
    "/subscribe?lang=en&settings=secret-token",
    "/?token=secret",
  ])("keeps private path %s noindex, nofollow", async (path) => {
    const { request, response } = await documentResponse(path);
    expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_NOFOLLOW_ROBOTS);
    expect(response.headers.get("Cache-Control")).toBe(
      LOCALE_PRIVATE_CACHE_CONTROL
    );
    expect(metaRobots(request)).toBe(response.headers.get("X-Robots-Tag"));
  });

  it.each([
    { path: "/abcdef12", status: 404 },
    { path: "/", status: 500 },
    { path: "/mcp?lang=vi", status: 503 },
  ])(
    "keeps $status response at $path noindex, nofollow",
    async ({ path, status }) => {
      const { request, response } = await documentResponse(path, { status });
      expect(response.headers.get("X-Robots-Tag")).toBe(
        NOINDEX_NOFOLLOW_ROBOTS
      );
      expect(response.headers.get("Cache-Control")).toBe(
        LOCALE_PRIVATE_CACHE_CONTROL
      );
      expect(response.headers.get("Vary")).toBe("Cookie, Accept-Language");
      // Deliberate asymmetry, unchanged here: a failed response is noindex in
      // both surfaces, and only the header adds nofollow. Asserting both sides
      // keeps a future edit to one of them deliberate.
      expect(metaRobots(request, status)).toBe(NOINDEX_FOLLOW_ROBOTS);
    }
  );

  it("still noindexes a faceted bare localized URL", async () => {
    // The removed verdict used to apply to every bare localized response. Only
    // the canonical shape was wrong: a query-selected variant of the same page
    // is a facet and keeps noindex, follow from routeIndexability.
    const { response } = await documentResponse(
      "/abcdef12?utm_source=telegram"
    );
    expect(response.headers.get("X-Robots-Tag")).toBe(NOINDEX_FOLLOW_ROBOTS);
    expect(response.headers.get("Cache-Control")).toBe(
      LOCALE_PRIVATE_CACHE_CONTROL
    );
  });
});
