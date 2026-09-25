/** @vitest-environment happy-dom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLocale } from "../lib/lang";
import { LangContext } from "../lib/lang-context";
import { ClerkRootProvider } from "./ClerkRootProvider";

vi.mock("../lib/clerk-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/clerk-user")>();
  const { useState } = await import("react");
  let nextMountId = 0;
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
      }) => {
        // Model Clerk's mount-time redirect configuration: prop-only updates
        // deliberately keep the old URLs until this provider is remounted.
        const [mounted] = useState(() => ({
          mountId: ++nextMountId,
          signInFallbackRedirectUrl,
          signInUrl,
          signUpFallbackRedirectUrl,
          signUpUrl,
        }));
        return (
          <div data-mount-id={mounted.mountId} data-testid="clerk-provider">
            <a data-testid="sign-in-url" href={mounted.signInUrl}>
              sign in
            </a>
            <a data-testid="sign-up-url" href={mounted.signUpUrl}>
              sign up
            </a>
            <a
              data-testid="sign-in-fallback-url"
              href={mounted.signInFallbackRedirectUrl}
            >
              sign in fallback
            </a>
            <a
              data-testid="sign-up-fallback-url"
              href={mounted.signUpFallbackRedirectUrl}
            >
              sign up fallback
            </a>
            {children}
          </div>
        );
      },
    }),
  };
});

function appWithNavigationLang(lang: "en" | "vi") {
  return (
    <LangContext.Provider value={lang}>
      <ClerkRootProvider>
        <span>app content</span>
      </ClerkRootProvider>
    </LangContext.Provider>
  );
}

function expectAuthUrls(lang: "en" | "vi") {
  expect(screen.getByTestId("sign-in-url").getAttribute("href")).toBe(
    `/sign-in?lang=${lang}`
  );
  expect(screen.getByTestId("sign-up-url").getAttribute("href")).toBe(
    `/sign-up?lang=${lang}`
  );
  expect(screen.getByTestId("sign-in-fallback-url").getAttribute("href")).toBe(
    `/?lang=${lang}`
  );
  expect(screen.getByTestId("sign-up-fallback-url").getAttribute("href")).toBe(
    `/?lang=${lang}`
  );
}

afterEach(() => {
  cleanup();
});

describe("ClerkRootProvider locale navigation", () => {
  it.each([
    {
      source: "explicit lang query",
      resolution: resolveLocale({ search: "?lang=en" }),
      expected: "en" as const,
    },
    {
      source: "news_lang cookie",
      resolution: resolveLocale({ cookie: "news_lang=vi" }),
      expected: "vi" as const,
    },
  ])("preserves the $source locale in every auth URL", async (testCase) => {
    if (!testCase.resolution.ok) throw new Error("Expected a valid locale");
    render(appWithNavigationLang(testCase.resolution.lang));

    await screen.findByTestId("clerk-provider");
    expectAuthUrls(testCase.expected);
    expect(screen.getByText("app content")).not.toBeNull();
  });

  it("remounts and updates every auth URL after locale changes", async () => {
    const { rerender } = render(appWithNavigationLang("en"));
    const initial = await screen.findByTestId("clerk-provider");
    const initialMountId = Number(initial.getAttribute("data-mount-id"));
    expectAuthUrls("en");

    rerender(appWithNavigationLang("vi"));

    await waitFor(() => {
      const remounted = screen.getByTestId("clerk-provider");
      expect(Number(remounted.getAttribute("data-mount-id"))).toBe(
        initialMountId + 1
      );
    });
    expectAuthUrls("vi");
    expect(screen.getByText("app content")).not.toBeNull();
  });
});
