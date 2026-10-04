import handler from "@tanstack/react-start/server-entry";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../worker/types";

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: vi.fn() },
}));
vi.mock("../worker/ingest-schedule", () => ({
  ensureIngestAlarm: vi.fn(),
  tickIngest: vi.fn(),
}));
vi.mock("../worker/ingest-scheduler", () => ({
  NewsIngestScheduler: class {},
}));
vi.mock("../worker/workflow", () => ({
  NewsIngestWorkflow: class {},
}));

const { default: server } = await import("./server");

function fetchLocale(request: Request): Promise<Response> {
  const result = server.fetch(request, {} as Env);
  if (result instanceof Promise) return result;
  return Promise.resolve(result as Response);
}

describe("Worker locale redirects", () => {
  it("normalizes a legacy locale alias before the permanent story hop", async () => {
    // The alias hop is temporary (its target depends on the requester); the
    // story permutation it unblocks is permanent.
    const first = await fetchLocale(
      new Request(
        "https://aidr.today/ai/abcdef1234567890?locale=en&utm_source=telegram"
      )
    );
    expect(first.status).toBe(307);
    expect(first.headers.get("Location")).toBe(
      "https://aidr.today/ai/abcdef1234567890?utm_source=telegram&lang=en"
    );
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
    expect(first.headers.get("Vary")).toContain("Cookie");
    expect(first.headers.get("Content-Language")).toBe("en");

    const second = await fetchLocale(
      new Request(first.headers.get("Location") ?? "", { redirect: "manual" })
    );
    expect(second.status).toBe(308);
    expect(second.headers.get("Location")).toBe(
      "https://aidr.today/abcdef12?utm_source=telegram&lang=en"
    );
    expect(second.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects repeated, conflicting, and invalid locale values", async () => {
    for (const search of [
      "?lang=en&lang=vi",
      "?lang=en&locale=vi",
      "?lang=fr",
      "?locale=fr",
    ]) {
      const response = await fetchLocale(
        new Request(`https://aidr.today/mcp${search}`)
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Vary")).toContain("Accept-Language");
      expect(response.headers.get("Content-Language")).toContain("vi");
    }
    const legacyInvalid = await fetchLocale(
      new Request("https://aidr.today/ai/abcdef1234567890?lang=fr")
    );
    expect(legacyInvalid.status).toBe(400);
    expect(legacyInvalid.headers.get("Cache-Control")).toBe(
      "private, no-store"
    );
  });

  it("uses a permanent header-selected redirect for a bare legacy story", async () => {
    const response = await fetchLocale(
      new Request("https://aidr.today/ai/abcdef1234567890", {
        headers: { cookie: "news_lang=en" },
      })
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "https://aidr.today/abcdef12?lang=en"
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toContain("Cookie");
  });

  /**
   * `/{category}/{slug}` and over-long id hashes are permanent permutations of
   * the documented `/{8-hex}` canonical, so they must consolidate instead of
   * re-testing the old address (#223).
   */
  it.each([
    "/industry/0544ce90",
    "/research/d88dfbb9",
    "/ai/some-title-abcdef12",
    "/abcdef1234567890",
  ])("redirects %s permanently to the 8-hex canonical", async (path) => {
    const response = await fetchLocale(
      new Request(`https://aidr.today${path}`)
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toMatch(
      /^https:\/\/aidr\.today\/[0-9a-f]{8}\?lang=(vi|en)$/
    );
    // Permanent for crawlers, still private for shared caches: the target
    // depends on the requester's cookie / Accept-Language.
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie, Accept-Language");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("lands a legacy story URL on its canonical in a single hop", async () => {
    vi.mocked(handler.fetch).mockImplementation(
      async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
    );

    const first = await fetchLocale(
      new Request("https://aidr.today/industry/0544ce90")
    );
    expect(first.status).toBe(308);

    const second = await fetchLocale(
      new Request(first.headers.get("Location") ?? "", { redirect: "manual" })
    );
    expect(second.status).toBe(200);
    expect(second.headers.get("Location")).toBeNull();
    expect(second.headers.get("X-Robots-Tag")).toBe("index, follow");
  });

  it.each([
    "/_serverFn/0544ce90",
    "/api/0544ce90",
    "/sign-in/0544ce90",
    "/sign-up/0544ce90",
    "/assets/0544ce90",
    "/cdn-cgi/0544ce90",
  ])(
    "does not hijack the reserved path %s into a story redirect",
    async (path) => {
      vi.mocked(handler.fetch).mockImplementation(
        async () =>
          new Response("<html></html>", {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
      );

      const response = await fetchLocale(
        new Request(`https://aidr.today${path}`)
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Location")).toBeNull();
    }
  );

  it("strips locale variants from a language-neutral page", async () => {
    const response = await fetchLocale(
      new Request("https://aidr.today/about?lang=vi&tab=about")
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "https://aidr.today/about?tab=about"
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Language")).toBe("en");
    expect(response.headers.get("Set-Cookie")).toContain("news_lang=vi;");
  });

  it("settles /data locale normalization in one server hop", async () => {
    vi.mocked(handler.fetch).mockImplementation(
      async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
    );

    for (const testCase of [
      {
        search: "?lang=vi",
        cookie: "news_lang=en",
        acceptLanguage: "en-US,en;q=0.9",
        expectedLang: "vi",
        expectedPath: "/data",
      },
      {
        search: "?lang=en",
        cookie: "news_lang=vi",
        acceptLanguage: "vi-VN,vi;q=0.9",
        expectedLang: "en",
        expectedPath: "/data",
      },
      {
        search: "?tab=algo&lang=vi",
        cookie: "news_lang=en",
        acceptLanguage: "en-US,en;q=0.9",
        expectedLang: "vi",
        expectedPath: "/data?tab=algo",
      },
      {
        search: "?locale=en",
        cookie: "news_lang=vi",
        acceptLanguage: "vi-VN,vi;q=0.9",
        expectedLang: "en",
        expectedPath: "/data",
      },
    ]) {
      const first = await fetchLocale(
        new Request(`https://aidr.today/data${testCase.search}`, {
          headers: {
            cookie: testCase.cookie,
            "accept-language": testCase.acceptLanguage,
          },
        })
      );
      expect(first.status).toBe(307);
      expect(first.headers.get("Location")).toBe(
        `https://aidr.today${testCase.expectedPath}`
      );
      expect(first.headers.get("Set-Cookie")).toContain(
        `news_lang=${testCase.expectedLang};`
      );
      expect(first.headers.get("Cache-Control")).toBe("private, no-store");
      expect(first.headers.get("Vary")).toContain("Accept-Language");

      const second = await fetchLocale(
        new Request(first.headers.get("Location") ?? "", {
          headers: { cookie: `news_lang=${testCase.expectedLang}` },
        })
      );
      expect(second.status).toBe(200);
      expect(second.headers.get("Location")).toBeNull();
      expect(second.headers.get("Cache-Control")).toContain("s-maxage=600");
      expect(second.headers.get("Vary")).toBe("Cookie, Accept-Language");
    }
  });

  it("normalizes locale-bearing extension requests before the compatibility redirect", async () => {
    const explicit = await fetchLocale(
      new Request("https://aidr.today/extension?lang=en&utm_source=chrome")
    );
    expect(explicit.status).toBe(307);
    expect(explicit.headers.get("Location")).toBe(
      "https://aidr.today/subscribe?utm_source=chrome&lang=en"
    );
    expect(explicit.headers.get("Cache-Control")).toBe("private, no-store");
    expect(explicit.headers.get("Vary")).toContain("Cookie");
    expect(explicit.headers.get("Content-Language")).toBe("en");

    const legacy = await fetchLocale(
      new Request("https://aidr.today/extension?locale=vi")
    );
    expect(legacy.status).toBe(307);
    expect(legacy.headers.get("Location")).toBe(
      "https://aidr.today/subscribe?lang=vi"
    );
    expect(legacy.headers.get("Cache-Control")).toBe("private, no-store");

    for (const search of [
      "?lang=en&lang=vi",
      "?lang=en&locale=vi",
      "?lang=fr",
    ]) {
      const invalid = await fetchLocale(
        new Request(`https://aidr.today/extension${search}`)
      );
      expect(invalid.status).toBe(400);
      expect(invalid.headers.get("Cache-Control")).toBe("private, no-store");
      expect(invalid.headers.get("Vary")).toContain("Accept-Language");
    }

    const bare = await fetchLocale(new Request("https://aidr.today/extension"));
    expect(bare.status).toBe(301);
    expect(bare.headers.get("Location")).toBe("https://aidr.today/subscribe");
    expect(bare.headers.get("Cache-Control")).toBe("private, no-store");
    expect(bare.headers.get("Vary")).toBe("Cookie, Accept-Language");
  });

  it("keeps bare /data stable for cookie and Accept-Language selection", async () => {
    vi.mocked(handler.fetch).mockImplementation(
      async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
    );

    const headerCases: Array<Record<string, string>> = [
      { cookie: "news_lang=en", "accept-language": "vi-VN,vi;q=0.9" },
      { cookie: "news_lang=vi", "accept-language": "en-US,en;q=0.9" },
      { "accept-language": "en-US,en;q=0.9" },
    ];
    for (const headers of headerCases) {
      const response = await fetchLocale(
        new Request("https://aidr.today/data?tab=overview", { headers })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Location")).toBeNull();
      expect(response.headers.get("Content-Language")).toBe("en");
      expect(response.headers.get("Vary")).toBe("Cookie, Accept-Language");
      expect(response.headers.get("Cache-Control")).toContain("s-maxage=600");
    }
  });

  it("keeps the private admin data tab private after locale normalization", async () => {
    vi.mocked(handler.fetch).mockImplementation(
      async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
    );

    const first = await fetchLocale(
      new Request("https://aidr.today/data?lang=vi&tab=admin")
    );
    expect(first.status).toBe(307);
    expect(first.headers.get("Location")).toBe(
      "https://aidr.today/data?tab=admin"
    );
    expect(first.headers.get("Set-Cookie")).toContain("news_lang=vi;");

    const second = await fetchLocale(
      new Request("https://aidr.today/data?tab=admin", {
        headers: { cookie: "news_lang=vi" },
      })
    );
    expect(second.status).toBe(200);
    expect(second.headers.get("Cache-Control")).toBe("private, no-store");
    expect(second.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(second.headers.get("Vary")).toContain("Cookie");
  });

  it("applies the API locale gate before route middleware", async () => {
    const alias = await fetchLocale(
      new Request("https://aidr.today/api/public?locale=en")
    );
    expect(alias.status).toBe(307);
    expect(alias.headers.get("Location")).toBe(
      "https://aidr.today/api/public?lang=en"
    );
    expect(alias.headers.get("Cache-Control")).toBe("private, no-store");

    const invalid = await fetchLocale(
      new Request("https://aidr.today/api/feed?lang=fr")
    );
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("Content-Language")).toBe("en, vi");
    expect(invalid.headers.get("Vary")).toContain("Cookie");
  });

  it("keeps sign-in and sign-up child routes private and language-neutral", async () => {
    vi.mocked(handler.fetch).mockImplementation(
      async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
    );

    for (const path of ["/sign-in/account", "/sign-up/verify"]) {
      const response = await fetchLocale(
        new Request(`https://aidr.today${path}?lang=vi`, {
          headers: { "accept-language": "en" },
        })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Language")).toBe("en");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Vary")).toContain("Cookie");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
  });

  it("applies the final SSR locale policy to rendered route responses", async () => {
    vi.mocked(handler.fetch).mockImplementation(
      async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
    );

    const explicit = await fetchLocale(
      new Request("https://aidr.today/mcp?lang=en")
    );
    expect(explicit.status).toBe(200);
    expect(explicit.headers.get("Content-Language")).toBe("en");
    expect(explicit.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(explicit.headers.get("X-Robots-Tag")).toBe("index, follow");

    // Left out of the sitemap, so indexability used to stamp private, no-store
    // and the explicit-lang edge TTL never landed.
    const submit = await fetchLocale(
      new Request("https://aidr.today/contribute/new?lang=en")
    );
    expect(submit.status).toBe(200);
    expect(submit.headers.get("Content-Language")).toBe("en");
    expect(submit.headers.get("Cache-Control")).toBe(
      "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
    );
    expect(submit.headers.get("Vary")).toBeNull();
    const bareSubmit = await fetchLocale(
      new Request("https://aidr.today/contribute/new", {
        headers: { cookie: "news_lang=vi" },
      })
    );
    expect(bareSubmit.headers.get("Cache-Control")).toBe("private, no-store");
    expect(bareSubmit.headers.get("Vary")).toBe("Cookie, Accept-Language");

    // The reported regression: a bare permalink is private and varied, but a
    // private cache policy is not a robots policy. It must be indexable so the
    // URL a human types or a Telegram link carries can rank (#223).
    for (const path of ["/", "/0544ce90"]) {
      const bare = await fetchLocale(
        new Request(`https://aidr.today${path}`, {
          headers: { "accept-language": "en-US,en;q=0.9" },
        })
      );
      expect(bare.status).toBe(200);
      expect(bare.headers.get("X-Robots-Tag")).toBe("index, follow");
      expect(bare.headers.get("Cache-Control")).toBe("private, no-store");
      // Field names are case-insensitive; `/` passes through the locale layer
      // twice (withHomepageHeaders + the Worker tail), and the merge
      // normalizes case.
      expect(bare.headers.get("Vary")?.toLowerCase()).toBe(
        "cookie, accept-language"
      );
    }

    const privateRoute = await fetchLocale(
      new Request("https://aidr.today/subscribe?lang=en&settings=secret")
    );
    expect(privateRoute.headers.get("Cache-Control")).toBe("private, no-store");
    expect(privateRoute.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(privateRoute.headers.get("Vary")).toContain("Cookie");

    const neutralWithoutSelectionHeaders = await fetchLocale(
      new Request("https://aidr.today/about")
    );
    expect(neutralWithoutSelectionHeaders.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=600, stale-while-revalidate=3600"
    );
    expect(neutralWithoutSelectionHeaders.headers.get("Vary")).toBe(
      "Cookie, Accept-Language"
    );
  });
});
