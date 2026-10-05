import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  langCookieHeader,
  langFromAcceptLanguage,
  langFromCookie,
  langFromQuery,
  readLangFromCookie,
  resolveLocale,
  statusLabel,
  timeAgo,
} from "./lang";

describe("locale parsing", () => {
  it("accepts only exact vi/en query values", () => {
    expect(langFromQuery("?lang=vi")).toBe("vi");
    expect(langFromQuery("?lang=en")).toBe("en");
    expect(langFromQuery("?lang=en&lang=vi")).toBeNull();
    expect(langFromQuery("?lang=en-US")).toBeNull();
  });

  it("supports locale only as a single compatibility alias", () => {
    expect(langFromQuery("?locale=vi")).toBe("vi");
    expect(langFromQuery("?lang=en&locale=vi")).toBeNull();
    expect(langFromQuery("?locale=en&locale=vi")).toBeNull();
  });

  it("serializes a validated language cookie for redirects and clients", () => {
    expect(langCookieHeader("en")).toBe(
      "news_lang=en; Path=/; Max-Age=31536000; SameSite=Lax"
    );
    expect(langCookieHeader("vi")).toContain("news_lang=vi;");
  });

  it("parses exact news_lang cookies and defaults safely", () => {
    expect(langFromCookie("foo=1; news_lang=en; bar=2")).toBe("en");
    expect(langFromCookie("news_lang=enigma")).toBeNull();
    expect(readLangFromCookie("news_lang=enigma")).toBe("vi");
    expect(readLangFromCookie(null)).toBe("vi");
  });

  it("selects the highest-quality supported Accept-Language range", () => {
    expect(langFromAcceptLanguage("fr-FR, en-US;q=0.9, vi;q=0.8")).toBe("en");
    expect(langFromAcceptLanguage("fr, vi-VN;q=0.7, en;q=0.6")).toBe("vi");
    expect(langFromAcceptLanguage("fr-FR, de;q=0.8")).toBeNull();
  });

  it("rejects repeated, conflicting, and invalid explicit values", () => {
    expect(resolveLocale({ search: "?lang=en&lang=vi" })).toMatchObject({
      ok: false,
      code: "repeated_locale",
    });
    expect(resolveLocale({ search: "?locale=vi&locale=vi" })).toMatchObject({
      ok: false,
      code: "repeated_locale",
    });
    expect(resolveLocale({ search: "?lang=en&locale=vi" })).toMatchObject({
      ok: false,
      code: "conflicting_locale",
    });
    expect(resolveLocale({ search: "?lang=fr" })).toMatchObject({
      ok: false,
      code: "invalid_locale",
    });
  });

  it("resolves query, legacy, cookie, Accept-Language, then Vietnamese", () => {
    expect(
      resolveLocale({
        search: "?lang=en",
        cookie: "news_lang=vi",
        acceptLanguage: "vi",
      })
    ).toMatchObject({ ok: true, lang: "en", source: "lang" });
    expect(
      resolveLocale({ search: "?locale=en", cookie: "news_lang=vi" })
    ).toMatchObject({ ok: true, lang: "en", legacy: true, source: "locale" });
    expect(
      resolveLocale({ cookie: "news_lang=en", acceptLanguage: "vi" })
    ).toMatchObject({ ok: true, lang: "en", source: "cookie" });
    expect(resolveLocale({ acceptLanguage: "en-US,vi;q=0.8" })).toMatchObject({
      ok: true,
      lang: "en",
      source: "accept-language",
    });
    expect(resolveLocale({})).toMatchObject({
      ok: true,
      lang: "vi",
      source: "default",
    });
  });
});

describe("categoryLabel", () => {
  it("keeps the site's own taxonomy untranslated in both locales", () => {
    // Regression: "Research" rendered as "Nghiên cứu" and "Infra" as "Hạ tầng"
    // on the Vietnamese UI. Categories name upstream topic slugs, so a
    // Vietnamese label matched nothing the reader could search for or click
    // through to, and read as a different category than the one it was.
    for (const name of [
      "Agents",
      "Chips",
      "Funding",
      "Industry",
      "Infra",
      "Legal",
      "Models",
      "Products",
      "Regulation",
      "Releases",
      "Research",
    ]) {
      expect(categoryLabel(name, "en"), name).toBe(name);
      expect(categoryLabel(name, "vi"), name).toBe(name);
    }
  });

  it("passes through an unknown category rather than guessing a translation", () => {
    for (const name of ["uncategorized", "Mixed Case", "brand-new-topic"]) {
      expect(categoryLabel(name, "vi"), name).toBe(name);
    }
  });
});

describe("statusLabel", () => {
  it("names a merged item in Vietnamese and leaves English and unknown statuses raw", () => {
    // /data charts items.status. Ingest writes "merged", so the Vietnamese
    // bar must name it. An unrecognized status stays the raw DB value.
    expect(statusLabel("merged", "vi")).toBe("Đã gộp");
    expect(statusLabel("merged", "en")).toBe("merged");
    expect(statusLabel("not-a-status", "vi")).toBe("not-a-status");
  });
});

describe("timeAgo", () => {
  const now = 1_700_000_000_000;

  it("formats seconds input", () => {
    expect(timeAgo(now / 1000 - 90, now, "en")).toBe("1m ago");
    expect(timeAgo(now / 1000 - 7200, now, "en")).toBe("2h ago");
    expect(timeAgo(now / 1000 - 86400 * 3, now, "en")).toBe("3d ago");
  });

  it("normalizes millisecond epoch input", () => {
    const secAgo = now / 1000 - 120;
    expect(timeAgo(secAgo * 1000, now, "en")).toBe("2m ago");
  });

  it("formats Vietnamese branches", () => {
    expect(timeAgo(now / 1000 - 1800, now, "vi")).toBe("30 phút trước");
    expect(timeAgo(now / 1000 - 7200, now, "vi")).toBe("2 giờ trước");
    expect(timeAgo(now / 1000 - 86400, now, "vi")).toBe("1 ngày trước");
  });
});
