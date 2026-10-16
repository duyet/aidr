/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClerkModuleContext } from "../lib/clerk-user";
import { SuggestTranslation } from "./SuggestTranslation";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    useNavigate: () => navigate,
    Link: ({
      children,
      to,
      params: _params,
      search: _search,
      ...rest
    }: {
      children?: ReactNode;
      to: string;
      params?: unknown;
      search?: unknown;
    } & Record<string, unknown>) =>
      React.createElement("a", { ...rest, href: to }, children),
  };
});

// The server fn module imports cloudflare:workers, which vitest cannot load.
vi.mock("../lib/suggest-fn", () => ({
  fetchSuggestionStatus: vi.fn(),
  fetchSuggestions: vi.fn(),
  submitSuggestion: vi.fn(),
}));

const preloadClerk = vi.fn();

function renderSignedOut(props: {
  initialText?: string;
  suggestionAttempt?: number;
}) {
  const ui = (
    <ClerkModuleContext.Provider
      value={{ mod: null, publishableKey: "pk_test_suggest", preloadClerk }}
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
            preloadClerk,
          }}
        >
          <SuggestTranslation itemId="abcdef12deadbeef" lang="en" {...next} />
        </ClerkModuleContext.Provider>
      ),
  };
}

beforeEach(() => {
  navigate.mockClear();
  preloadClerk.mockClear();
});

afterEach(cleanup);

describe("SuggestTranslation signed out without the Clerk SDK", () => {
  it("renders a sign-in link that preloads the SDK on hover and focus", () => {
    renderSignedOut({});
    const link = screen.getByRole("link", { name: "Sign in to suggest" });
    expect(link.getAttribute("href")).toBe("/sign-in/$");
    fireEvent.pointerEnter(link);
    fireEvent.focus(link);
    expect(preloadClerk).toHaveBeenCalledTimes(2);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("sends a selection 'Suggest' click to /sign-in instead of dropping it", () => {
    const { rerender } = renderSignedOut({
      initialText: "bản dịch này sai",
      suggestionAttempt: 1,
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({
      to: "/sign-in/$",
      params: { _splat: "" },
      search: { lang: "en" },
    });

    // A re-render with the same attempt is not a second click.
    rerender({ initialText: "bản dịch này sai", suggestionAttempt: 1 });
    expect(navigate).toHaveBeenCalledTimes(1);

    // Selecting the same text again is a new click.
    rerender({ initialText: "bản dịch này sai", suggestionAttempt: 2 });
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});
