import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PREFS,
  loadPrefs,
  readerCssVars,
  readerDataAttrs,
  savePrefs,
} from "./prefs";

function createLocalStorageStub() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
}

// vitest's "node" environment has no window/localStorage — stub the bare
// minimum prefs.ts needs so its SSR guards (`typeof window`) exercise the
// browser branch instead of always short-circuiting to defaults.
beforeEach(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", createLocalStorageStub());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prefs", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("shows all four sections to a new user", () => {
    expect(loadPrefs().sections).toEqual({
      categories: true,
      trending: true,
      tldr: true,
      days: true,
    });
  });

  it("keeps a returning user's hidden daily feed", () => {
    savePrefs({
      ...DEFAULT_PREFS,
      sections: { ...DEFAULT_PREFS.sections, days: false },
    });
    expect(loadPrefs().sections.days).toBe(false);
  });

  it("round-trips saved prefs", () => {
    const prefs = {
      ...DEFAULT_PREFS,
      font: "serif" as const,
      fontSize: 1.15,
      density: "spacious" as const,
      bg: "cream" as const,
      sections: { ...DEFAULT_PREFS.sections, trending: false },
    };
    savePrefs(prefs);
    expect(loadPrefs()).toEqual(prefs);
  });

  it("defaults sectionOrder and merges persisted keys", () => {
    expect(DEFAULT_PREFS.sectionOrder).toEqual([
      "categories",
      "trending",
      "tldr",
      "days",
    ]);
    savePrefs({
      ...DEFAULT_PREFS,
      sectionOrder: ["tldr", "trending", "days", "categories"],
    });
    expect(loadPrefs().sectionOrder).toEqual([
      "tldr",
      "trending",
      "days",
      "categories",
    ]);
    savePrefs({
      ...DEFAULT_PREFS,
      sectionOrder: ["tldr", "trending"],
    });
    expect(loadPrefs().sectionOrder).toEqual([
      "tldr",
      "trending",
      "categories",
      "days",
    ]);
    localStorage.setItem(
      "news_prefs",
      JSON.stringify({ sectionOrder: "not-an-array" })
    );
    expect(loadPrefs().sectionOrder).toEqual(DEFAULT_PREFS.sectionOrder);
  });

  it("clamps out-of-range font sizes", () => {
    localStorage.setItem("news_prefs", JSON.stringify({ fontSize: 9 }));
    expect(loadPrefs().fontSize).toBe(1.25);
    localStorage.setItem("news_prefs", JSON.stringify({ fontSize: -3 }));
    expect(loadPrefs().fontSize).toBe(0.85);
  });

  it("defaults tldrCount to 8 and clamps invalid values", () => {
    expect(DEFAULT_PREFS.tldrCount).toBe(8);
    localStorage.setItem("news_prefs", JSON.stringify({ tldrCount: 12 }));
    expect(loadPrefs().tldrCount).toBe(12);
    localStorage.setItem("news_prefs", JSON.stringify({ tldrCount: 99 }));
    expect(loadPrefs().tldrCount).toBe(8);
    localStorage.setItem("news_prefs", JSON.stringify({ tldrCount: "16" }));
    expect(loadPrefs().tldrCount).toBe(8);
  });

  it("falls back to defaults on malformed JSON", () => {
    localStorage.setItem("news_prefs", "not json");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("maps density to padding and typeset rhythm vars", () => {
    const compact = readerCssVars({ ...DEFAULT_PREFS, density: "compact" });
    expect(compact["--reader-pad"]).toBe("0.5rem");
    expect(compact["--reader-leading"]).toBe("1.55");
    expect(compact["--reader-flow"]).toBe("0.95em");

    const spacious = readerCssVars({ ...DEFAULT_PREFS, density: "spacious" });
    expect(spacious["--reader-pad"]).toBe("1.125rem");
    expect(spacious["--reader-leading"]).toBe("1.9");
    expect(spacious["--reader-flow"]).toBe("1.6em");
    expect(spacious["--reader-font-size"]).toBe("1");
  });

  it("defaults to the middle density and maps the new levels", () => {
    expect(DEFAULT_PREFS.density).toBe("medium");
    const medium = readerCssVars(DEFAULT_PREFS);
    expect(medium["--reader-pad"]).toBe("0.625rem");
    expect(
      readerCssVars({ ...DEFAULT_PREFS, density: "dense" })["--reader-pad"]
    ).toBe("0.375rem");
  });

  it("keeps saved density levels and drops unknown ones", () => {
    savePrefs({ ...DEFAULT_PREFS, density: "compact" });
    expect(loadPrefs().density).toBe("compact");
    localStorage.setItem("news_prefs", JSON.stringify({ density: "huge" }));
    expect(loadPrefs().density).toBe("medium");
  });

  it("loads a blob saved before the redesign and fills the new keys", () => {
    localStorage.setItem(
      "news_prefs",
      JSON.stringify({
        font: "serif",
        fontSize: 1.1,
        density: "compact",
        bg: "gray",
        sections: { trending: false, tldr: true, days: true, categories: true },
        sectionOrder: ["tldr", "trending", "days", "categories"],
        tldrCount: 12,
        bilingualDialog: true,
      })
    );
    expect(loadPrefs()).toEqual({
      font: "serif",
      headFont: "sans",
      fontSize: 1.1,
      density: "compact",
      bg: "gray",
      sections: { trending: false, tldr: true, days: true, categories: true },
      sectionOrder: ["tldr", "trending", "days", "categories"],
      tldrCount: 12,
      bilingualDialog: true,
      layout: "compact",
      accent: "yellow",
      highlight: "topic",
      bilingualFirst: "vi",
      bilingual: false,
      tldrCols: 2,
      tldrView: "image",
      newsCols: 2,
      thumbs: true,
      summaries: false,
      feedDays: 3,
      infiniteDays: false,
    });
  });

  it("keeps each valid new pref and drops values outside its set", () => {
    const valid = {
      layout: "newspaper",
      accent: "violet",
      highlight: "none",
      headFont: "serif",
      bilingualFirst: "en",
      tldrCols: 3,
      tldrView: "text",
      newsCols: 3,
      thumbs: false,
      summaries: true,
      feedDays: 7,
      infiniteDays: true,
    };
    localStorage.setItem("news_prefs", JSON.stringify(valid));
    expect(loadPrefs()).toMatchObject(valid);

    localStorage.setItem(
      "news_prefs",
      JSON.stringify({
        layout: "magazine",
        accent: "purple",
        highlight: "all",
        headFont: "mono",
        bilingualFirst: "both",
        tldrCols: "3",
        tldrView: "video",
        newsCols: 1,
        thumbs: "false",
        summaries: 1,
        feedDays: 5,
        infiniteDays: null,
      })
    );
    expect(loadPrefs()).toMatchObject({
      layout: "compact",
      accent: "yellow",
      highlight: "topic",
      headFont: "sans",
      bilingualFirst: "vi",
      bilingual: false,
      tldrCols: 2,
      tldrView: "image",
      newsCols: 2,
      thumbs: true,
      summaries: false,
      feedDays: 3,
      infiniteDays: false,
    });
  });

  it("drops a corrupt font or background and any unknown key", () => {
    localStorage.setItem(
      "news_prefs",
      JSON.stringify({ font: "comic", bg: "neon", layoutV0: "grid" })
    );
    const prefs = loadPrefs();
    expect(prefs.font).toBe("sans");
    expect(prefs.bg).toBe("default");
    expect(prefs).not.toHaveProperty("layoutV0");
    localStorage.setItem("news_prefs", "null");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("exposes the page-wide prefs as data attributes", () => {
    expect(
      readerDataAttrs({
        ...DEFAULT_PREFS,
        bg: "black",
        layout: "newspaper",
        accent: "rose",
        highlight: "one",
        tldrCols: 3,
        newsCols: 3,
        thumbs: false,
        summaries: true,
        headFont: "serif",
      })
    ).toEqual({
      "data-reader-bg": "black",
      "data-layout": "newspaper",
      "data-accent": "rose",
      "data-highlight": "one",
      "data-tldr-cols": "3",
      "data-news-cols": "3",
      "data-thumbs": "off",
      "data-summaries": "on",
      "data-head-font": "serif",
      "data-bilingual": "off",
    });
  });

  it("returns defaults when window is unavailable (SSR)", () => {
    vi.unstubAllGlobals();
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs(DEFAULT_PREFS)).not.toThrow();
  });
});
