/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLocale } from "../lib/lang";
import { LangContext } from "../lib/lang-context";
import { ClerkRootProvider } from "./ClerkRootProvider";

vi.mock("../lib/clerk-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/clerk-user")>();
  return {
    ...actual,
    getClerkPublishableKey: () => "pk_test_locale_navigation",
    loadClerkModule: async () => ({
      ClerkProvider: ({
        children,
        signInFallbackRedirectUrl,
        signInUrl,
        signUpFallbackRedirectUrl,
        signUpUrl,
      }: {
        children: ReactNode;
        signInFallbackRedirectUrl: string;
        signInUrl: string;
        signUpFallbackRedirectUrl: string;
        signUpUrl: string;
      }) => (
        <div data-testid="clerk-provider">
          <a data-testid="sign-in-url" href={signInUrl}>
            sign in
          </a>
          <a data-testid="sign-up-url" href={signUpUrl}>
            sign up
          </a>
          <a
            data-testid="sign-in-fallback-url"
            href={signInFallbackRedirectUrl}
          >
            sign in fallback
          </a>
          <a
            data-testid="sign-up-fallback-url"
            href={signUpFallbackRedirectUrl}
          >
            sign up fallback
          </a>
          {children}
        </div>
      ),
    }),
  };
});

afterEach(() => {
  cleanup();
});

describe("ClerkRootProvider locale navigation", () => {
  it.each([
    {
      source: "explicit lang query",
      resolution: resolveLocale({ search: "?lang=en" }),
      expected: "en",
    },
    {
      source: "news_lang cookie",
      resolution: resolveLocale({ cookie: "news_lang=vi" }),
      expected: "vi",
    },
  ])("preserves the $source locale in every auth URL", async (testCase) => {
    if (!testCase.resolution.ok) throw new Error("Expected a valid locale");
    render(
      <LangContext.Provider value={testCase.resolution.lang}>
        <ClerkRootProvider>
          <span>app content</span>
        </ClerkRootProvider>
      </LangContext.Provider>
    );

    await screen.findByTestId("clerk-provider");
    expect(screen.getByTestId("sign-in-url").getAttribute("href")).toBe(
      `/sign-in?lang=${testCase.expected}`
    );
    expect(screen.getByTestId("sign-up-url").getAttribute("href")).toBe(
      `/sign-up?lang=${testCase.expected}`
    );
    expect(
      screen.getByTestId("sign-in-fallback-url").getAttribute("href")
    ).toBe(`/?lang=${testCase.expected}`);
    expect(
      screen.getByTestId("sign-up-fallback-url").getAttribute("href")
    ).toBe(`/?lang=${testCase.expected}`);
    expect(screen.getByText("app content")).not.toBeNull();
  });
});
