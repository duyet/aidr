/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../../lib/prefs";
import { ThemeTab } from "./ThemeTab";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));
const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme }),
}));

afterEach(() => {
  cleanup();
  setTheme.mockClear();
});

/** Renders the tab over real state so each click shows what gets saved. */
function renderTab(initial: Partial<Prefs> = {}) {
  let saved: Prefs = { ...DEFAULT_PREFS, ...initial };
  function Harness() {
    const [prefs, set] = useState(saved);
    return (
      <PrefsContext.Provider
        value={{
          prefs,
          setPrefs: (u) =>
            set((p) => {
              saved = { ...p, ...u };
              return saved;
            }),
        }}
      >
        <ThemeTab t={(en) => en} />
      </PrefsContext.Provider>
    );
  }
  render(<Harness />);
  return () => saved;
}

const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

function menu(name: string): HTMLSelectElement {
  const el = screen.getByRole("combobox", { name });
  if (!(el instanceof HTMLSelectElement))
    throw new Error(`${name} is not a select`);
  return el;
}

const pick = (name: string, option: string) => {
  const select = menu(name);
  const match = [...select.options].find((o) => o.text === option);
  if (!match) throw new Error(`no "${option}" option in ${name}`);
  fireEvent.change(select, { target: { value: match.value } });
  return select;
};

describe("ThemeTab text size menu", () => {
  it("offers 85% to 125% in 5% steps, the values the old slider saved", () => {
    renderTab();
    const select = menu("Text size");
    expect([...select.options].map((o) => o.text)).toEqual([
      "85%",
      "90%",
      "95%",
      "100%",
      "105%",
      "110%",
      "115%",
      "120%",
      "125%",
    ]);
  });

  it("saves the picked size and shows it as selected", () => {
    const prefs = renderTab();
    const select = pick("Text size", "115%");
    expect(prefs().fontSize).toBe(1.15);
    expect(select.selectedOptions[0]?.text).toBe("115%");
  });

  it("shows the nearest step for a size stored between steps", () => {
    renderTab({ fontSize: 1.02 });
    const select = menu("Text size");
    expect(select.selectedOptions[0]?.text).toBe("100%");
  });
});

describe("ThemeTab density menu", () => {
  it("lists every density by name, tightest first", () => {
    renderTab();
    const select = menu("Density");
    expect([...select.options].map((o) => o.text)).toEqual([
      "Dense",
      "Compact",
      "Medium",
      "Comfortable",
      "Relaxed",
      "Spacious",
      "Airy",
    ]);
  });

  it("saves the picked density", () => {
    const prefs = renderTab({ density: "medium" });
    pick("Density", "Airy");
    expect(prefs().density).toBe("airy");
  });
});

describe("ThemeTab font and background", () => {
  it("saves the chosen font and marks it pressed", () => {
    const prefs = renderTab();
    click("Serif");
    expect(prefs().font).toBe("serif");
    expect(
      screen.getByRole("button", { name: "Serif" }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("names each swatch, so the colour is not the only cue", () => {
    const prefs = renderTab();
    click("Cream");
    expect(prefs().bg).toBe("cream");
    expect(
      screen.getByRole("button", { name: "Cream" }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("a dark swatch also switches the site to dark mode", () => {
    renderTab();
    click("Black");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("ThemeTab reset", () => {
  it("restores every display pref and hands the mode back to the system", () => {
    const prefs = renderTab({ font: "serif", fontSize: 1.2, density: "airy" });
    click("Reset to default");
    const { font, fontSize, density, bg } = prefs();
    expect({ font, fontSize, density, bg }).toEqual({
      font: DEFAULT_PREFS.font,
      fontSize: DEFAULT_PREFS.fontSize,
      density: DEFAULT_PREFS.density,
      bg: DEFAULT_PREFS.bg,
    });
    expect(setTheme).toHaveBeenCalledWith("system");
  });
});
