import { describe, expect, it } from "vitest";
import {
  absoluteSiteUrl,
  canonicalLocaleRedirect,
  hasCanonicalLocaleQuery,
  localeCacheControl,
  neutralLocaleRedirect,
  sameOriginRedirectUrl,
  withLang,
  withSiteLang,
} from "./locale-url";

const PUBLIC = "public, max-age=60";

describe("locale URL construction", () => {
  it("uses one explicit lang parameter and preserves attribution", () => {
    expect(withLang("/abcdef12?utm_source=telegram&lang=en", "vi")).toBe(
      "/abcdef12?utm_source=telegram&lang=vi"
    );
    expect(absoluteSiteUrl("/abcdef12", "en")).toBe(
      "https://aidr.today/abcdef12?lang=en"
    );
  });

  it("keeps explicit locale on internal navigation destinations", () => {
    expect(withLang("/sign-up", "en")).toBe("/sign-up?lang=en");
    expect(withLang("/subscribe?unsubscribe=secret-token", "vi")).toBe(
      "/subscribe?unsubscribe=secret-token&lang=vi"
    );
    expect(withLang("/mcp", "en")).toBe("/mcp?lang=en");
    expect(withLang("/about", "vi")).toBe("/about?lang=vi");
  });

  it("never adds a site locale to publisher URLs", () => {
    const source = "https://example.com/story?a=1";
    expect(withSiteLang(source, "en")).toBe(source);
  });
});

describe("canonical locale query policy", () => {
  it("recognizes only one exact canonical lang", () => {
    expect(hasCanonicalLocaleQuery("?lang=vi")).toBe(true);
    expect(hasCanonicalLocaleQuery("?lang=en&utm_source=telegram")).toBe(true);
    expect(hasCanonicalLocaleQuery("?locale=en")).toBe(false);
    expect(hasCanonicalLocaleQuery("?lang=en&lang=vi")).toBe(false);
    expect(hasCanonicalLocaleQuery("?lang=fr")).toBe(false);
  });

  it("normalizes one valid alias without dropping UTM", () => {
    expect(
      canonicalLocaleRedirect(
        "/abcdef12",
        "?locale=en&utm_source=telegram",
        "#sources",
        "en"
      )
    ).toBe("/abcdef12?utm_source=telegram&lang=en#sources");
  });

  it("does not redirect invalid, repeated, or conflicting values", () => {
    expect(
      canonicalLocaleRedirect("/abcdef12", "?lang=fr", "", "en")
    ).toBeNull();
    expect(
      canonicalLocaleRedirect("/abcdef12", "?lang=en&lang=vi", "", "en")
    ).toBeNull();
    expect(
      canonicalLocaleRedirect("/abcdef12", "?lang=vi&locale=en", "", "vi")
    ).toBeNull();
  });

  it("removes locale parameters from language-neutral canonical URLs", () => {
    expect(neutralLocaleRedirect("/about", "?lang=vi&tab=about", "#top")).toBe(
      "/about?tab=about#top"
    );
  });

  it("leaves bare routes and already-canonical routes alone", () => {
    expect(canonicalLocaleRedirect("/", "", "", "vi")).toBeNull();
    expect(
      canonicalLocaleRedirect("/abcdef12", "?lang=en", "", "en")
    ).toBeNull();
  });
});

describe("same-origin locale redirects", () => {
  const attack = "https://aidr.today//evil.example?locale=en";

  it("rejects scheme-relative, backslash, and cross-origin targets", () => {
    expect(sameOriginRedirectUrl("//evil.example?lang=en", attack)).toBeNull();
    expect(
      sameOriginRedirectUrl("/\\evil.example?lang=en", "https://aidr.today/")
    ).toBeNull();
    expect(
      sameOriginRedirectUrl("\\\\evil.example?lang=en", "https://aidr.today/")
    ).toBeNull();
    expect(
      sameOriginRedirectUrl(
        "https://evil.example/?lang=en",
        "https://aidr.today/"
      )
    ).toBeNull();
    expect(
      sameOriginRedirectUrl(
        "https://aidr.today//evil.example?lang=en",
        "https://aidr.today/"
      )
    ).toBeNull();
    expect(
      sameOriginRedirectUrl("http://aidr.today/?lang=en", "https://aidr.today/")
    ).toBeNull();
  });

  it("keeps homepage, story, and day targets on the request origin", () => {
    expect(
      sameOriginRedirectUrl("/?lang=en", "https://aidr.today/?locale=en")?.href
    ).toBe("https://aidr.today/?lang=en");
    expect(
      sameOriginRedirectUrl(
        "/abcdef12?utm_source=telegram&lang=en#sources",
        "https://aidr.today/abcdef12?locale=en"
      )?.href
    ).toBe("https://aidr.today/abcdef12?utm_source=telegram&lang=en#sources");
    expect(
      sameOriginRedirectUrl(
        "/date/2026-10-02.md?lang=en",
        "https://aidr.today/date/2026-10-02.md?locale=en"
      )?.href
    ).toBe("https://aidr.today/date/2026-10-02.md?lang=en");
    expect(
      sameOriginRedirectUrl(
        "/api/story/abcdef12.md?lang=en",
        "https://aidr.today/api/story/abcdef12.md?locale=en"
      )?.href
    ).toBe("https://aidr.today/api/story/abcdef12.md?lang=en");
    expect(
      sameOriginRedirectUrl(
        "https://aidr.today/subscribe?lang=en",
        "https://aidr.today/extension?locale=en"
      )?.href
    ).toBe("https://aidr.today/subscribe?lang=en");
  });
});

describe("locale cache policy", () => {
  it("publicly caches only explicit canonical locale URLs", () => {
    expect(localeCacheControl("?lang=vi", PUBLIC)).toEqual({
      cacheControl: PUBLIC,
    });
    expect(localeCacheControl("", PUBLIC)).toEqual({
      cacheControl: "private, no-store",
      vary: "Cookie, Accept-Language",
    });
    expect(localeCacheControl("?lang=fr", PUBLIC).cacheControl).toBe(
      "private, no-store"
    );
  });
});
