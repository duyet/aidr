/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../../lib/analytics/track";
import { DEFAULT_PREFS, PrefsContext } from "../../lib/prefs";
import { SettingsTab } from "./SettingsTab";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

function renderTab() {
  return render(
    <PrefsContext.Provider value={{ prefs: DEFAULT_PREFS, setPrefs: () => {} }}>
      <SettingsTab t={(en) => en} />
    </PrefsContext.Provider>
  );
}

describe("SettingsTab prefs_change", () => {
  it("reports the chosen AI;DR item count as its value", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "12" }));
    expect(track).toHaveBeenCalledExactlyOnceWith("prefs_change", {
      pref: "tldrCount",
      pref_value: "12",
    });
  });
});
