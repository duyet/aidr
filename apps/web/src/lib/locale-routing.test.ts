import { describe, expect, it } from "vitest";
import { preserveRootLang, validateRootSearch } from "./locale-routing";

describe("root locale search", () => {
  it("validates only exact supported values and keeps the first repeated value", () => {
    expect(validateRootSearch({ lang: "en", locale: "vi" })).toEqual({
      lang: "en",
      locale: "vi",
    });
    expect(validateRootSearch({ lang: ["en", "vi"] })).toEqual({ lang: "en" });
    expect(validateRootSearch({ lang: "fr" })).toEqual({});
  });

  it("preserves an explicit locale when child navigation replaces search", () => {
    expect(preserveRootLang({ lang: "en" }, { locale: "en" })).toEqual({
      locale: "en",
      lang: "en",
    });
    expect(preserveRootLang({ lang: "en" }, { lang: "vi" })).toEqual({
      lang: "vi",
    });
  });
});
