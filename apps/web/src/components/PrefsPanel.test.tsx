/** @vitest-environment happy-dom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createAgent } from "@ui-sdk/react/agent";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../lib/analytics/track";
import { LangContext } from "../lib/lang-context";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../lib/prefs";
import type { Lang } from "../lib/types";
import { PrefsPanel } from "./PrefsPanel";

declare global {
  var __UI_SDK_STRICT__: boolean | undefined;
}
globalThis.__UI_SDK_STRICT__ = true;
HTMLElement.prototype.showPopover = () => {};
HTMLElement.prototype.hidePopover = () => {};
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = () => {};
Element.prototype.checkVisibility = () => true;

vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));
const themes = vi.hoisted(() => ({ theme: "system", setTheme: vi.fn() }));
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: themes.theme,
    resolvedTheme: "light",
    setTheme: themes.setTheme,
  }),
}));

const agent = createAgent();
const realMatchMedia = window.matchMedia;

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
  themes.setTheme.mockClear();
  themes.theme = "system";
  window.matchMedia = realMatchMedia;
  document.documentElement.classList.remove("dark");
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function renderPanel({
  prefs: initial = {},
  lang: initialLang = "en",
  langDisabled = false,
}: {
  prefs?: Partial<Prefs>;
  lang?: Lang;
  langDisabled?: boolean;
} = {}) {
  let saved: Prefs = { ...DEFAULT_PREFS, ...initial };
  const onLangChange = vi.fn();
  function Harness() {
    const [prefs, setPrefs] = useState(saved);
    const [lang, setLang] = useState<Lang>(initialLang);
    return (
      <LangContext.Provider value={lang}>
        <PrefsContext.Provider
          value={{
            prefs,
            setPrefs: (update) =>
              setPrefs((p) => {
                saved = { ...p, ...update };
                return saved;
              }),
          }}
        >
          <PrefsPanel
            langDisabled={langDisabled}
            onLangChange={(next) => {
              onLangChange(next);
              setLang(next);
            }}
          />
        </PrefsContext.Provider>
      </LangContext.Provider>
    );
  }
  render(<Harness />);
  return { prefs: () => saved, onLangChange };
}

async function openPanel(trigger = "Reader preferences") {
  const button = screen.getByRole("button", { name: trigger });
  button.focus();
  fireEvent.click(button);
  await settle();
  return button;
}

function option(group: string | RegExp, name: string | RegExp) {
  return within(screen.getByRole("radiogroup", { name: group })).getByRole(
    "radio",
    { name }
  );
}

async function pick(group: string | RegExp, name: string | RegExp) {
  fireEvent.click(option(group, name));
  await settle();
}

const checked = (group: string) =>
  within(screen.getByRole("radiogroup", { name: group }))
    .getAllByRole("radio")
    .filter((r) => r.getAttribute("aria-checked") === "true")
    .map((r) => r.textContent);

describe("PrefsPanel trigger and drawer", () => {
  it("keeps the Aa name, opens the Customize dialog, and Escape returns focus", async () => {
    renderPanel();
    const trigger = await openPanel();
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    const dialog = screen.getByRole("dialog", { name: "Customize" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("the close button closes it and returns focus too", async () => {
    renderPanel();
    const trigger = await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("names the trigger and the drawer in Vietnamese", async () => {
    renderPanel({ lang: "vi" });
    await openPanel("Tuỳ chỉnh hiển thị");
    expect(
      screen.getByRole("dialog", { name: "Tuỳ chỉnh giao diện" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Đóng" })).toBeTruthy();
  });

  it("slides in from the right on desktop and up from the bottom below 700px", async () => {
    renderPanel();
    await openPanel();
    expect(screen.getByRole("dialog").getAttribute("data-side")).toBe("right");
    cleanup();

    window.matchMedia = ((query: string) => ({
      matches: query === "(max-width: 699px)",
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    renderPanel();
    await openPanel();
    expect(screen.getByRole("dialog").getAttribute("data-side")).toBe("bottom");
  });
});

describe("PrefsPanel agent access", () => {
  it("an agent can find every setting by name and change it", async () => {
    const { prefs } = renderPanel();
    await openPanel();

    const components = agent
      .snapshot()
      .filter((entry) => !entry.offPage && entry.component !== "more");
    for (const entry of components) {
      expect(
        entry.label,
        `${entry.component} ${entry.ref} has no name`
      ).toBeTruthy();
    }
    const labels = components.map((entry) => entry.label);
    for (const label of [
      "Customize",
      "Layout",
      "Language",
      "Shown first",
      "Mode",
      "Background",
      "Accent",
      "Highlight by topic",
      "Headlines",
      "Body",
      "Text size",
      "Newspaper columns",
      "AI;DR card",
      "AI;DR items",
      "AI;DR columns",
      "AI;DR as",
      "Trending",
      "Thumbnails",
      "Summaries",
      "Categories",
      "Ranked list",
      "Days shown",
      "Load more days on scroll",
      "Reset to defaults",
    ]) {
      expect(labels, `${label} is missing from the snapshot`).toContain(label);
    }

    const result = await act(() =>
      agent.act({
        steps: [
          { ref: "Layout", action: "setValue", args: ["newspaper"] },
          { ref: "Accent", action: "setValue", args: ["violet"] },
          { ref: "AI;DR columns", action: "setValue", args: ["3"] },
          { ref: "Days shown", action: "setValue", args: ["7"] },
          { ref: "Trending", action: "setChecked", args: [false] },
          {
            ref: "Load more days on scroll",
            action: "setChecked",
            args: [true],
          },
        ],
      })
    );
    expect(result.ok, result.error?.message).toBe(true);
    expect(prefs()).toMatchObject({
      layout: "newspaper",
      accent: "violet",
      tldrCols: 3,
      feedDays: 7,
      infiniteDays: true,
      sections: { ...DEFAULT_PREFS.sections, trending: false },
    });
  });
});

describe("PrefsPanel choices", () => {
  it("arrow keys move a choice and save it", async () => {
    const { prefs } = renderPanel();
    await openPanel();
    const compact = option("Layout", "Compact");
    compact.focus();
    fireEvent.keyDown(compact, { key: "ArrowRight" });
    await settle();
    expect(prefs().layout).toBe("comfortable");
    expect(checked("Layout")).toEqual(["Normal"]);
    expect(track).toHaveBeenCalledWith("prefs_change", {
      pref: "layout",
      pref_value: "comfortable",
    });
  });

  it.each([
    ["Accent", "Rose", { accent: "rose" }, "accent", "rose"],
    ["Highlight by topic", "Off", { highlight: "none" }, "highlight", "none"],
    ["Headlines", "Serif", { headFont: "serif" }, "headFont", "serif"],
    ["Body", "Serif", { font: "serif" }, "font", "serif"],
    ["Newspaper columns", "3", { newsCols: 3 }, "newsCols", "3"],
    ["AI;DR items", "16", { tldrCount: 16 }, "tldrCount", "16"],
    ["AI;DR columns", "1", { tldrCols: 1 }, "tldrCols", "1"],
    ["AI;DR as", "Image", { tldrView: "image" }, "tldrView", "image"],
    ["Days shown", "1", { feedDays: 1 }, "feedDays", "1"],
  ] as const)(
    "%s → %s saves and tracks it",
    async (group, name, saved, pref, value) => {
      const { prefs } = renderPanel();
      await openPanel();
      await pick(group, name);
      expect(prefs()).toMatchObject(saved);
      expect(checked(group)).toEqual([name]);
      expect(track).toHaveBeenCalledWith("prefs_change", {
        pref,
        pref_value: value,
      });
    }
  );

  it("shows the nearest text size step and saves the picked one", async () => {
    const { prefs } = renderPanel({ prefs: { fontSize: 1.02 } });
    await openPanel();
    expect(checked("Text size")).toEqual(["100%"]);
    await pick("Text size", "A++");
    expect(prefs().fontSize).toBe(1.24);
    expect(track).toHaveBeenCalledWith("prefs_change", { pref: "fontSize" });
  });

  it("names each swatch, so color is not the only cue", async () => {
    renderPanel();
    await openPanel();
    expect(
      within(screen.getByRole("radiogroup", { name: "Accent" }))
        .getAllByRole("radio")
        .map((r) => r.textContent)
    ).toEqual(["Yellow", "Blue", "Green", "Rose", "Violet"]);
    expect(
      within(screen.getByRole("radiogroup", { name: "Background" }))
        .getAllByRole("radio")
        .map((r) => r.textContent)
    ).toEqual(["Paper", "Gray", "Black"]);
  });
});

describe("PrefsPanel show switches", () => {
  it.each([
    ["AI;DR card", "sections.tldr", (p: Prefs) => p.sections.tldr],
    ["Trending", "sections.trending", (p: Prefs) => p.sections.trending],
    ["Thumbnails", "thumbs", (p: Prefs) => p.thumbs],
    ["Summaries", "summaries", (p: Prefs) => p.summaries],
    ["Categories", "sections.categories", (p: Prefs) => p.sections.categories],
    ["Ranked list", "sections.days", (p: Prefs) => p.sections.days],
    ["Load more days on scroll", "infiniteDays", (p: Prefs) => p.infiniteDays],
  ] as const)("%s flips %s and tracks it", async (name, pref, read) => {
    const { prefs } = renderPanel();
    await openPanel();
    const before = read(prefs());
    const control = screen.getByRole("switch", { name });
    expect(control.getAttribute("aria-checked")).toBe(String(before));
    fireEvent.click(control);
    await settle();
    expect(read(prefs())).toBe(!before);
    expect(control.getAttribute("aria-checked")).toBe(String(!before));
    expect(track).toHaveBeenCalledWith("prefs_change", {
      pref,
      pref_value: before ? "off" : "on",
    });
  });
});

describe("PrefsPanel mode and background", () => {
  it("black switches the site to dark and the mode follows", async () => {
    const { prefs } = renderPanel();
    await openPanel();
    await pick("Background", "Black");
    expect(prefs().bg).toBe("black");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(checked("Mode")).toEqual(["Dark"]);
    expect(track).toHaveBeenCalledWith("prefs_change", {
      pref: "bg",
      pref_value: "black",
    });
  });

  it("paper keeps the mode the reader is in", async () => {
    const { prefs } = renderPanel({ prefs: { bg: "black" } });
    await openPanel();
    await pick("Background", "Paper");
    expect(prefs().bg).toBe("default");
    expect(themes.setTheme).toHaveBeenCalledWith("dark");
  });

  it("a mode puts the paper background back and hands the theme to next-themes", async () => {
    const { prefs } = renderPanel({ prefs: { bg: "gray" } });
    await openPanel();
    expect(checked("Mode")).toEqual(["Light"]);
    await pick("Mode", "Auto");
    expect(prefs().bg).toBe("default");
    expect(themes.setTheme).toHaveBeenCalledWith("system");
    expect(track).toHaveBeenCalledWith("prefs_change", {
      pref: "theme",
      pref_value: "auto",
    });
  });

  it("a legacy cream background checks no swatch", async () => {
    renderPanel({ prefs: { bg: "cream" } });
    await openPanel();
    expect(checked("Background")).toEqual([]);
  });
});

describe("PrefsPanel language", () => {
  it("VI + EN turns bilingual on and leads with the chosen language", async () => {
    const { prefs, onLangChange } = renderPanel();
    await openPanel();
    await pick("Language", "VI + EN");
    expect(prefs().bilingual).toBe(true);
    expect(onLangChange).toHaveBeenLastCalledWith("vi");
    expect(track).toHaveBeenCalledWith("prefs_change", {
      pref: "bilingual",
      pref_value: "on",
    });

    // Bilingual mode labels every control in both languages.
    await pick(/Shown first/, /EN first/);
    expect(prefs().bilingualFirst).toBe("en");
    expect(onLangChange).toHaveBeenLastCalledWith("en");

    await pick(/Language/, "VI");
    expect(prefs().bilingual).toBe(false);
    expect(onLangChange).toHaveBeenLastCalledWith("vi");
    expect(track).toHaveBeenCalledWith("prefs_change", {
      pref: "bilingual",
      pref_value: "off",
    });
  });

  it("changing the lead outside bilingual mode keeps the page language", async () => {
    const { prefs, onLangChange } = renderPanel();
    await openPanel();
    await pick("Shown first", "EN first");
    expect(prefs().bilingualFirst).toBe("en");
    expect(onLangChange).not.toHaveBeenCalled();
  });

  it("is locked on English-only pages", async () => {
    renderPanel({ langDisabled: true });
    await openPanel();
    for (const name of ["VI", "EN", "VI + EN"]) {
      expect(option("Language", name).hasAttribute("data-disabled")).toBe(true);
    }
  });
});

describe("PrefsPanel quick looks and reset", () => {
  it("Night desk goes black with a blue accent", async () => {
    const { prefs } = renderPanel();
    await openPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Night desk Black, blue accent" })
    );
    await settle();
    expect(prefs()).toMatchObject({ bg: "black", accent: "blue" });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(track).toHaveBeenCalledWith("prefs_change", {
      pref: "look",
      pref_value: "night",
    });
  });

  it("Newspaper sets the print layout in light mode", async () => {
    const { prefs } = renderPanel();
    await openPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Newspaper Print feel, serif" })
    );
    await settle();
    expect(prefs()).toMatchObject({
      layout: "newspaper",
      headFont: "serif",
      font: "serif",
      summaries: true,
    });
    expect(themes.setTheme).toHaveBeenCalledWith("light");
  });

  it("Bilingual turns on VI over EN and switches the page to Vietnamese", async () => {
    const { prefs, onLangChange } = renderPanel();
    await openPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Bilingual VI over EN" })
    );
    await settle();
    expect(prefs()).toMatchObject({ bilingual: true, bilingualFirst: "vi" });
    expect(onLangChange).toHaveBeenCalledWith("vi");
  });

  it("reset is off at the defaults and restores every pref when used", async () => {
    renderPanel();
    await openPanel();
    expect(
      screen
        .getByRole("button", { name: "Reset to defaults" })
        .hasAttribute("disabled")
    ).toBe(true);
    cleanup();

    const { prefs } = renderPanel({
      prefs: {
        layout: "newspaper",
        bg: "black",
        fontSize: 1.24,
        sections: { ...DEFAULT_PREFS.sections, days: false },
      },
    });
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    await settle();
    expect(prefs()).toEqual(DEFAULT_PREFS);
    expect(themes.setTheme).toHaveBeenCalledWith("system");
    expect(track).toHaveBeenCalledWith("prefs_change", { pref: "reset" });
  });
});
