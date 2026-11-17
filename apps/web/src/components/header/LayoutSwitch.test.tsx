/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../../lib/analytics/track";
import { LangContext } from "../../lib/lang-context";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../../lib/prefs";
import type { Lang } from "../../lib/types";
import { LayoutSwitch } from "./LayoutSwitch";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

function Shell({ lang }: { lang: Lang }) {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  return (
    <LangContext.Provider value={lang}>
      <PrefsContext.Provider
        value={{
          prefs,
          setPrefs: (update) => setPrefsState((p) => ({ ...p, ...update })),
        }}
      >
        <div data-testid="shell" data-layout={prefs.layout}>
          <LayoutSwitch />
        </div>
      </PrefsContext.Provider>
    </LangContext.Provider>
  );
}

describe("LayoutSwitch", () => {
  it("names each icon and checks the saved layout", () => {
    render(<Shell lang="vi" />);
    const group = screen.getByRole("radiogroup", { name: "Bố cục" });
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Gọn",
      "Thoáng",
      "Báo in",
    ]);
    expect(radios.every((r) => r.textContent === "")).toBe(true);
    expect(
      screen.getByRole("radio", { name: "Gọn" }).getAttribute("aria-checked")
    ).toBe("true");
    expect(group).toBeTruthy();
  });

  it("sets prefs.layout and reports it", () => {
    render(<Shell lang="en" />);
    fireEvent.click(screen.getByRole("radio", { name: "Newspaper" }));
    expect(screen.getByTestId("shell").dataset.layout).toBe("newspaper");
    expect(track).toHaveBeenCalledExactlyOnceWith("prefs_change", {
      pref: "layout",
      pref_value: "newspaper",
    });
  });

  it("steps through the layouts with the arrow keys", () => {
    render(<Shell lang="en" />);
    const compact = screen.getByRole("radio", { name: "Compact" });
    compact.focus();
    fireEvent.keyDown(compact, { key: "ArrowRight" });
    expect(screen.getByTestId("shell").dataset.layout).toBe("comfortable");
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "Comfortable" })
    );
  });
});
