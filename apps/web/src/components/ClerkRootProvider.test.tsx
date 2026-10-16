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
import { type ClerkModule, loadClerkModule } from "../lib/clerk-user";
import { resolveLocale } from "../lib/lang";
import { LangContext } from "../lib/lang-context";
import type { Lang } from "../lib/types";
import {
  ClerkRootProvider,
  clerkProviderLocaleOptions,
} from "./ClerkRootProvider";
import { HeaderAuth } from "./header/HeaderAuth";
import { SubmitForm } from "./submit/SubmitForm";

const routerState = { pathname: "/", searchStr: "" };

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
      select: (s: { location: { pathname: string; href: string } }) => string;
    }) =>
      select({
        location: {
          pathname: routerState.pathname,
          href: `${routerState.pathname}${routerState.searchStr}`,
        },
      }),
    Link: ({
      children,
      hash,
      to,
      params: _params,
      search,
      ...rest
    }: {
      children?: ReactNode;
      hash?: string;
      to: string;
      params?: unknown;
      search?: Record<string, string>;
    } & Record<string, unknown>) => {
      const query = new URLSearchParams(search).toString();
      return React.createElement(
        "a",
        {
          ...rest,
          href: `${to}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`,
        },
        children
      );
    },
  };
});

vi.mock("../lib/submit-fn", () => ({
  submitStory: vi.fn(),
}));

vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));

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

  /** Resolves `loadClerkModule` with a provider that marks its subtree. */
  function resolveSdk() {
    const ClerkProvider = ({ children }: { children?: ReactNode }) => (
      <div data-testid="clerk-provider">{children}</div>
    );
    load.mockResolvedValue({ ClerkProvider } as unknown as ClerkModule);
  }

  beforeEach(() => {
    load.mockReset();
    load.mockImplementation(() => new Promise(() => {}));
    routerState.pathname = "/";
    routerState.searchStr = "";
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

  it("inserts the provider on /sign-in once the SDK resolves", async () => {
    routerState.pathname = "/sign-in";
    resolveSdk();
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("clerk-provider")).not.toBeNull()
    );
    expect(screen.getByText("reader")).not.toBeNull();
  });

  // Leaving /sign-in without signing in keeps `__client_uat=0`, so
  // shouldMountClerk turns false on `/`. Pulling the provider then would
  // remount the page the reader just returned to and tear down Clerk.
  it("keeps the provider and the page mounted after navigating from /sign-in back to /", async () => {
    routerState.pathname = "/sign-in";
    resolveSdk();
    const { rerender } = mount();
    await waitFor(() =>
      expect(screen.getByTestId("clerk-provider")).not.toBeNull()
    );
    const provider = screen.getByTestId("clerk-provider");
    const page = screen.getByText("reader");

    routerState.pathname = "/";
    rerender(
      <ClerkRootProvider>
        <span>reader</span>
      </ClerkRootProvider>
    );

    expect(screen.getByTestId("clerk-provider")).toBe(provider);
    expect(screen.getByText("reader")).toBe(page);
  });

  it("loads when a navigation reaches /sign-in after a signed-out mount", () => {
    const { rerender } = mount();
    expect(load).not.toHaveBeenCalled();
    routerState.pathname = "/sign-in";
    rerender(
      <ClerkRootProvider>
        <span>reader</span>
      </ClerkRootProvider>
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads at the next navigation once a session cookie exists, so a modal sign-in shows the avatar", () => {
    const { rerender } = mount();
    setCookie("__client_uat=1757000000");
    expect(load).not.toHaveBeenCalled();
    routerState.pathname = "/story/abc";
    rerender(
      <ClerkRootProvider>
        <span>reader</span>
      </ClerkRootProvider>
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not load after a window pointerdown, which a phone touch-scroll fires", () => {
    mount();
    fireEvent.pointerDown(window);
    fireEvent.keyDown(window, { key: "a" });
    expect(load).not.toHaveBeenCalled();
  });

  it("preloads the SDK on header sign-in intent without remounting the page", async () => {
    resolveSdk();
    render(
      <LangContext.Provider value="en">
        <ClerkRootProvider>
          <HeaderAuth />
        </ClerkRootProvider>
      </LangContext.Provider>
    );
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(load).not.toHaveBeenCalled();
    fireEvent.pointerEnter(link);
    expect(load).toHaveBeenCalledTimes(1);
    await load.mock.results[0].value;
    // The resolved SDK must not be inserted: that would replace the link
    // under the pointer and close any open dialog on the page.
    await waitFor(() =>
      expect(screen.queryByTestId("clerk-provider")).toBeNull()
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toBe(link);
  });
});

describe("HeaderAuth sign-in link", () => {
  function headerHref() {
    render(
      <LangContext.Provider value="vi">
        <HeaderAuth />
      </LangContext.Provider>
    );
    const href = screen
      .getByRole("link", { name: "Sign in" })
      .getAttribute("href");
    return new URL(href ?? "", "https://aidr.today").searchParams;
  }

  beforeEach(() => {
    routerState.pathname = "/";
    routerState.searchStr = "";
  });

  it("returns the reader to the page they signed in from", () => {
    routerState.pathname = "/abcdef12";
    routerState.searchStr = "?lang=vi";
    const params = headerHref();
    expect(params.get("lang")).toBe("vi");
    expect(params.get("redirect_url")).toBe("/abcdef12?lang=vi");
  });

  it("never points sign-in back at the sign-in page", () => {
    routerState.pathname = "/sign-in/factor-one";
    expect(headerHref().get("redirect_url")).toBeNull();
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
