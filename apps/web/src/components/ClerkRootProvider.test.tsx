/** @vitest-environment happy-dom */

import type { BrowserClerkConstructor } from "@clerk/react";
import { ClerkProvider as RealClerkProvider } from "@clerk/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadClerkModule } from "../lib/clerk-user";
import { resolveLocale } from "../lib/lang";
import { LangContext } from "../lib/lang-context";
import type { Lang } from "../lib/types";
import {
  ClerkRootProvider,
  clerkProviderLocaleOptions,
} from "./ClerkRootProvider";
import { SubmitForm } from "./submit/SubmitForm";

const routerState = { pathname: "/" };

vi.mock("../lib/clerk-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/clerk-user")>();
  return {
    ...actual,
    getClerkPublishableKey: () => "pk_test_gate",
    loadClerkModule: vi.fn(() => new Promise(() => {})),
  };
});

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    useRouterState: ({
      select,
    }: {
      select: (s: { location: { pathname: string } }) => string;
    }) => select({ location: { pathname: routerState.pathname } }),
    Link: ({
      children,
      hash,
      to,
    }: {
      children?: ReactNode;
      hash?: string;
      to: string;
    }) =>
      React.createElement(
        "a",
        { href: `${to}${hash ? `#${hash}` : ""}` },
        children
      ),
  };
});

vi.mock("../lib/submit-fn", () => ({
  submitStory: vi.fn(),
}));

interface UpdateProps {
  options?: Record<string, unknown>;
}

class SingletonClerkHarness {
  static instances: SingletonClerkHarness[] = [];

  loaded = false;
  status = "ready";
  options: Record<string, unknown> = {};
  updateCount = 0;

  constructor(
    _publishableKey: string,
    _constructorOptions?: Record<string, unknown>
  ) {
    SingletonClerkHarness.instances.push(this);
  }

  async load(options: Record<string, unknown>) {
    this.options = { ...options };
    this.loaded = true;
    return this;
  }

  async __internal_updateProps(update: UpdateProps) {
    this.options = { ...this.options, ...update.options };
    this.updateCount += 1;
  }
}

const LifecycleProvider = RealClerkProvider as unknown as (
  props: ComponentProps<typeof RealClerkProvider> & {
    Clerk: BrowserClerkConstructor;
    experimental: { runtimeEnvironment: "headless" };
  }
) => ReactNode;

function expectClerkUrls(clerk: SingletonClerkHarness, lang: Lang) {
  expect(clerk.options.signInUrl).toBe(`/sign-in?lang=${lang}`);
  expect(clerk.options.signUpUrl).toBe(`/sign-up?lang=${lang}`);
  expect(clerk.options.signInFallbackRedirectUrl).toBe(`/?lang=${lang}`);
  expect(clerk.options.signUpFallbackRedirectUrl).toBe(`/?lang=${lang}`);
}

function appWithClerkLifecycle(lang: Lang) {
  return (
    <LangContext.Provider value={lang}>
      <LifecycleProvider
        Clerk={SingletonClerkHarness as unknown as BrowserClerkConstructor}
        experimental={{ runtimeEnvironment: "headless" }}
        publishableKey="pk_test_locale_lifecycle"
        {...clerkProviderLocaleOptions(lang)}
      >
        <SubmitForm
          getToken={async () => "test-token"}
          onSubmitted={vi.fn()}
          userId="user_test"
          userName="Test User"
        />
      </LifecycleProvider>
    </LangContext.Provider>
  );
}

afterEach(() => {
  cleanup();
  SingletonClerkHarness.instances.length = 0;
});

describe("ClerkRootProvider load gate", () => {
  const load = vi.mocked(loadClerkModule);

  function setCookie(value: string) {
    // biome-ignore lint/suspicious/noDocumentCookie: the provider reads document.cookie synchronously; the async Cookie Store cannot seed it before mount.
    document.cookie = value;
  }

  beforeEach(() => {
    load.mockClear();
    routerState.pathname = "/";
    setCookie("__client_uat=0");
  });

  function mount() {
    return render(
      <ClerkRootProvider>
        <span>reader</span>
      </ClerkRootProvider>
    );
  }

  it("does not download the SDK for a signed-out homepage visit with no interaction", () => {
    mount();
    expect(screen.getByText("reader")).not.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it("loads for a __client_uat session cookie so a signed-in reader sees their UserButton", () => {
    setCookie("__client_uat=1757000000");
    mount();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("treats __client_uat=0 as signed out and keeps the SDK off", () => {
    setCookie("__client_uat=0");
    mount();
    expect(load).not.toHaveBeenCalled();
  });

  it("loads on /sign-in so the sign-in form can mount without a session", () => {
    routerState.pathname = "/sign-in";
    mount();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads once after the first pointerdown so modal sign-in buttons work on tap", () => {
    mount();
    expect(load).not.toHaveBeenCalled();
    fireEvent.pointerDown(window);
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(window);
    fireEvent.keyDown(window, { key: "a" });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("Clerk locale options", () => {
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
  ])("maps $source to every auth URL", (testCase) => {
    if (!testCase.resolution.ok) throw new Error("Expected a valid locale");
    const options = clerkProviderLocaleOptions(testCase.resolution.lang);
    expect(options.signInUrl).toBe(`/sign-in?lang=${testCase.expected}`);
    expect(options.signUpUrl).toBe(`/sign-up?lang=${testCase.expected}`);
    expect(options.signInFallbackRedirectUrl).toBe(
      `/?lang=${testCase.expected}`
    );
    expect(options.signUpFallbackRedirectUrl).toBe(
      `/?lang=${testCase.expected}`
    );
  });

  it("updates the real provider singleton without remounting a filled submit form", async () => {
    const { rerender } = render(appWithClerkLifecycle("en"));
    await waitFor(() => {
      expect(SingletonClerkHarness.instances).toHaveLength(1);
      expect(SingletonClerkHarness.instances[0].loaded).toBe(true);
    });
    const clerk = SingletonClerkHarness.instances[0];
    expectClerkUrls(clerk, "en");

    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), {
      target: { value: "https://example.com/story" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Title (optional)" }),
      {
        target: { value: "A preserved story title" },
      }
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Note (optional)" }), {
      target: { value: "A preserved submission note" },
    });

    rerender(appWithClerkLifecycle("vi"));

    await waitFor(() => expectClerkUrls(clerk, "vi"));
    expect(SingletonClerkHarness.instances).toHaveLength(1);
    expect(clerk.updateCount).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByDisplayValue("https://example.com/story")
    ).not.toBeNull();
    expect(screen.getByDisplayValue("A preserved story title")).not.toBeNull();
    expect(
      screen.getByDisplayValue("A preserved submission note")
    ).not.toBeNull();
    expect(screen.getByText("Tiêu đề (không bắt buộc)")).not.toBeNull();
  });
});
