/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
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

// The story permalink for itemId "abcdef12deadbeef", URL-encoded as Clerk's
// redirect_url so the reader lands back on this story after signing in.
const SIGN_IN_HREF = "/sign-in?lang=en&redirect_url=%2Fabcdef12%3Flang%3Den";

function setCookie(value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: the fallback reads document.cookie synchronously; the async Cookie Store cannot seed it before render.
  document.cookie = value;
}

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
  setCookie("__client_uat=0");
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
    expect(link.getAttribute("href")).toBe(SIGN_IN_HREF);
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends a selection 'Suggest' click to /sign-in instead of dropping it", () => {
    const { rerender } = renderSignedOut({
      initialText: "bản dịch này sai",
      suggestionAttempt: 1,
    });
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(SIGN_IN_HREF);

    // A re-render with the same attempt is not a second click.
    rerender({ initialText: "bản dịch này sai", suggestionAttempt: 1 });
    expect(assign).toHaveBeenCalledTimes(1);

    // Selecting the same text again is a new click.
    rerender({ initialText: "bản dịch này sai", suggestionAttempt: 2 });
    expect(assign).toHaveBeenCalledTimes(2);
  });

  // A signed-in reader whose SDK is still downloading must not be sent to
  // /sign-in, by a click or by a selection "Suggest".
  it("shows plain text and never navigates while a session's SDK loads", () => {
    setCookie("__client_uat=1757000000");
    renderSignedOut({ initialText: "bản dịch này sai", suggestionAttempt: 1 });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Sign in to suggest")).not.toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  // The server cannot see whether the reader has a session, so it must not
  // render a link that a signed-in reader could click before hydration.
  it("server-renders plain text, never the sign-in link", () => {
    const html = renderToString(
      <ClerkModuleContext.Provider
        value={{
          mod: null,
          publishableKey: "pk_test_suggest",
          preloadClerk: () => {},
        }}
      >
        <SuggestTranslation itemId="abcdef12deadbeef" lang="vi" />
      </ClerkModuleContext.Provider>
    );
    expect(html).toContain("Đăng nhập để góp ý");
    expect(html).not.toContain("<a");
  });
});
