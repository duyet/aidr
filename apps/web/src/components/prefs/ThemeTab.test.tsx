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

describe("ThemeTab text size stepper", () => {
  it("steps 5% at a time, keeping the values the old slider saved", () => {
    const prefs = renderTab();
    click("Larger text");
    expect(prefs().fontSize).toBe(1.05);
    expect(screen.getByText("105%")).toBeTruthy();
    click("Smaller text");
    click("Smaller text");
    expect(prefs().fontSize).toBe(0.95);
  });

  it("stops at 85% and 125% so the reader cannot step off the range", () => {
    renderTab({ fontSize: 1.25 });
    const larger = screen.getByRole("button", { name: "Larger text" });
    expect((larger as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderTab({ fontSize: 0.85 });
    const smaller = screen.getByRole("button", { name: "Smaller text" });
    expect((smaller as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ThemeTab density stepper", () => {
  it("walks the same density list the slider used, with a named label", () => {
    const prefs = renderTab({ density: "medium" });
    click("Looser");
    expect(prefs().density).toBe("comfortable");
    expect(screen.getByText("Comfortable")).toBeTruthy();
    click("Tighter");
    click("Tighter");
    expect(prefs().density).toBe("compact");
  });

  it("disables the ends of the list", () => {
    renderTab({ density: "dense" });
    expect(
      (screen.getByRole("button", { name: "Tighter" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
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
