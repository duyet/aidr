/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../lib/analytics/track";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../lib/prefs";
import { HomeSections } from "./HomeSections";

vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

function renderSections(sections = DEFAULT_PREFS.sections) {
  const setPrefs = vi.fn<(u: Partial<Prefs>) => void>();
  render(
    <PrefsContext.Provider
      value={{ prefs: { ...DEFAULT_PREFS, sections }, setPrefs }}
    >
      <HomeSections lang="en" />
    </PrefsContext.Provider>
  );
  return setPrefs;
}

describe("HomeSections", () => {
  it("reports the section's new state, so hiding and showing are told apart", () => {
    renderSections({ ...DEFAULT_PREFS.sections, trending: false });
    fireEvent.click(screen.getByRole("button", { name: "Category nav" }));
    fireEvent.click(screen.getByRole("button", { name: "Trending" }));
    expect(vi.mocked(track).mock.calls).toEqual([
      ["prefs_change", { pref: "sections.categories", pref_value: "off" }],
      ["prefs_change", { pref: "sections.trending", pref_value: "on" }],
    ]);
  });

  it("hides a section without touching the others", () => {
    const setPrefs = renderSections();
    fireEvent.click(screen.getByRole("button", { name: "Daily feed" }));
    expect(setPrefs).toHaveBeenCalledWith({
      sections: { ...DEFAULT_PREFS.sections, days: false },
    });
  });
});
