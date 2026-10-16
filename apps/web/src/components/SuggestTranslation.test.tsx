/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClerkModuleContext } from "../lib/clerk-user";
import { SuggestTranslation } from "./SuggestTranslation";

// The server fn module imports cloudflare:workers, which vitest cannot load.
vi.mock("../lib/suggest-fn", () => ({
  fetchSuggestionStatus: vi.fn(),
  fetchSuggestions: vi.fn(),
  submitSuggestion: vi.fn(),
}));

const assign = vi.fn();

function renderSignedOut(props: {
  initialText?: string;
  suggestionAttempt?: number;
}) {
  const ui = (
    <ClerkModuleContext.Provider
      value={{
        mod: null,
        publishableKey: "pk_test_suggest",
        preloadClerk: () => {},
      }}
    >
      <SuggestTranslation itemId="abcdef12deadbeef" lang="en" {...props} />
    </ClerkModuleContext.Provider>
  );
  const result = render(ui);
  return {
    rerender: (next: typeof props) =>
      result.rerender(
        <ClerkModuleContext.Provider
          value={{
            mod: null,
            publishableKey: "pk_test_suggest",
            preloadClerk: () => {},
          }}
        >
          <SuggestTranslation itemId="abcdef12deadbeef" lang="en" {...next} />
        </ClerkModuleContext.Provider>
      ),
  };
}

beforeEach(() => {
  assign.mockClear();
  vi.stubGlobal("location", { ...window.location, assign });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SuggestTranslation signed out without the Clerk SDK", () => {
  it("renders a sign-in link and stays put until the reader asks", () => {
    renderSignedOut({});
    const link = screen.getByRole("link", { name: "Sign in to suggest" });
    expect(link.getAttribute("href")).toBe("/sign-in?lang=en");
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends a selection 'Suggest' click to /sign-in instead of dropping it", () => {
    const { rerender } = renderSignedOut({
      initialText: "bản dịch này sai",
      suggestionAttempt: 1,
    });
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/sign-in?lang=en");

    // A re-render with the same attempt is not a second click.
    rerender({ initialText: "bản dịch này sai", suggestionAttempt: 1 });
    expect(assign).toHaveBeenCalledTimes(1);

    // Selecting the same text again is a new click.
    rerender({ initialText: "bản dịch này sai", suggestionAttempt: 2 });
    expect(assign).toHaveBeenCalledTimes(2);
  });
});
