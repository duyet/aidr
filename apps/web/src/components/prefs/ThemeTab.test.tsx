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

function slider(name: string): HTMLInputElement {
  const el = screen.getByRole("slider", { name });
  if (!(el instanceof HTMLInputElement))
    throw new Error(`${name} is not a range input`);
  return el;
}

const slide = (name: string, value: string) => {
  fireEvent.change(slider(name), { target: { value } });
};

describe("ThemeTab text size slider", () => {
  it("offers 85% to 125% in 5% steps", () => {
    renderTab();
    const control = slider("Text size");
    expect(control.min).toBe("0.85");
    expect(control.max).toBe("1.25");
    expect(control.step).toBe("0.05");
  });

  it("saves the slid size and shows the percent readout", () => {
    const prefs = renderTab();
    slide("Text size", "1.15");
    expect(prefs().fontSize).toBe(1.15);
    expect(screen.getByText("115%")).toBeTruthy();
  });

  it("shows the stored size even between steps", () => {
    renderTab({ fontSize: 1.02 });
    expect(slider("Text size").value).toBe("1.02");
    expect(screen.getByText("102%")).toBeTruthy();
  });
});

describe("ThemeTab density slider", () => {
  it("steps through every density by name, tightest first", () => {
    renderTab();
    expect(slider("Density").max).toBe("6");
    expect(screen.getByText("Medium")).toBeTruthy();
  });

  it("saves the slid density and shows its name", () => {
    const prefs = renderTab({ density: "medium" });
    slide("Density", "6");
    expect(prefs().density).toBe("airy");
    expect(screen.getByText("Airy")).toBeTruthy();
    slide("Density", "0");
    expect(prefs().density).toBe("dense");
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
