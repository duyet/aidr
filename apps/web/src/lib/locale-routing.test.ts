import { describe, expect, it } from "vitest";
import {
  isLanguageNeutralSsrPath,
  isLocaleAwareApiPath,
  isPrivateSsrPath,
  preserveRootLang,
  validateRootSearch,
} from "./locale-routing";

describe("root locale search", () => {
  it("validates only exact supported values for the typed search shape", () => {
    expect(validateRootSearch({ lang: "en", locale: "vi" })).toEqual({
      lang: "en",
      locale: "vi",
    });
    expect(validateRootSearch({ lang: ["en", "vi"] })).toEqual({ lang: "en" });
    expect(validateRootSearch({ lang: "fr" })).toEqual({});
  });

  it("identifies public locale-aware API surfaces", () => {
    for (const path of [
      "/api/public",
      "/api/feed",
      "/api/feed/freshness",
      "/api/story/abcdef12",
      "/api/subscribe/preview",
      "/api/extension",
    ]) {
      expect(isLocaleAwareApiPath(path)).toBe(true);
    }
    expect(isLocaleAwareApiPath("/api/subscribe")).toBe(false);
    expect(isLocaleAwareApiPath("/api/admin/items")).toBe(false);
  });

  it("classifies neutral and tokenized private SSR paths", () => {
    expect(isLanguageNeutralSsrPath("/about/")).toBe(true);
    expect(isLanguageNeutralSsrPath("/sign-in")).toBe(true);
    expect(isLanguageNeutralSsrPath("/sign-in/account")).toBe(true);
    expect(isLanguageNeutralSsrPath("/sign-up/verify")).toBe(true);
    expect(isLanguageNeutralSsrPath("/mcp")).toBe(false);
    expect(isPrivateSsrPath("/subscribe", "?lang=en&settings=secret")).toBe(
      true
    );
    expect(isPrivateSsrPath("/subscribe", "?lang=en")).toBe(false);
    expect(isPrivateSsrPath("/mail")).toBe(true);
    expect(isPrivateSsrPath("/sign-in/account")).toBe(true);
    expect(isPrivateSsrPath("/sign-up/verify")).toBe(true);
  });

  it("preserves an explicit locale when child navigation replaces search", () => {
    expect(preserveRootLang({ lang: "en" }, { locale: "en" })).toEqual({
      locale: "en",
      lang: "en",
    });
    expect(preserveRootLang({ lang: "en" }, {})).toEqual({ lang: "en" });
    expect(preserveRootLang({ lang: "en" }, { lang: "vi" })).toEqual({
      lang: "vi",
    });
  });

  it("does not restore a locale removed by a neutral child route", () => {
    expect(
      preserveRootLang(
        { lang: "en" },
        { tab: "algo" },
        { removedAny: new Set(["lang", "locale"]) }
      )
    ).toEqual({ tab: "algo" });
    expect(
      preserveRootLang(
        { locale: "vi" },
        {},
        { removedAny: new Set(["locale"]) }
      )
    ).toEqual({});
  });
});
