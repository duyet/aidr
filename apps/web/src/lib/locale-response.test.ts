import { describe, expect, it } from "vitest";
import {
  LOCALE_PRIVATE_CACHE_CONTROL,
  normalizeLocaleRequest,
  SSR_LOCALIZED_CACHE_CONTROL,
  SSR_NEUTRAL_CACHE_CONTROL,
  withSsrLocaleResponse,
} from "./locale-response";

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
  it.each(["/mcp", "/subscribe", "/changelog", "/submit"])(
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

  it("keeps bare localized pages private and varied", () => {
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

  it.each(["/", "/changelog", "/mcp", "/submit", "/subscribe", "/abcdef12"])(
    "covers localized SSR route %s",
    (path) => {
      const response = withSsrLocaleResponse(
        new Request(`https://aidr.today${path}?lang=en`),
        html()
      );
      expect(response.headers.get("Content-Language")).toBe("en");
      expect(response.headers.get("Cache-Control")).toBe(
        SSR_LOCALIZED_CACHE_CONTROL
      );
      expect(response.headers.get("Vary")).toBeNull();
    }
  );

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
