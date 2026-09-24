import { describe, expect, it } from "vitest";
import {
  absoluteSiteUrl,
  canonicalLocaleRedirect,
  hasCanonicalLocaleQuery,
  localeCacheControl,
  neutralLocaleRedirect,
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
