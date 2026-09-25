/**
 * @vitest-environment happy-dom
 *
 * The header renders from several public routes, so the logo's destination is
 * part of the navigation contract. These tests drive a real TanStack router
 * (memory history, the root route's real `validateSearch` and search
 * middleware) and read the href that the real `Link` builds. Nothing here
 * mocks `@tanstack/react-router`, so no assertion can pass on a link that only
 * looks right because the component under test was replaced.
 */

import { track } from "@aidr/ui/track";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LangContext } from "../../lib/lang-context";
import {
  preserveRootLangFromMiddleware,
  validateRootSearch,
} from "../../lib/locale-routing";
import type { Lang } from "../../lib/types";
import { Brand } from "./Brand";

vi.mock("@aidr/ui/track", () => ({ track: vi.fn() }));

/**
 * The app's real root search contract, minus the SSR-only `beforeLoad` that
 * would need a Worker. `validateRootSearch` and `preserveRootLangFromMiddleware`
 * are the app's own, so a link that leaks a legacy `locale` or a router payload
 * is caught here rather than in a browser.
 *
 * The root component mounts `Brand` the way `HeaderBar` does — a layout above
 * `Outlet`, so it renders on every route — and the real `Link` inside it needs
 * no mocking.
 */
function makeRouteTree(contentLang: Lang, navigationLang: Lang) {
  const rootRoute = createRootRoute({
    validateSearch: validateRootSearch,
    search: {
      middlewares: [
        ({ search, next }) => preserveRootLangFromMiddleware(search, next),
      ],
    },
    component: () => (
      <LangContext.Provider value={navigationLang}>
        <Brand lang={contentLang} />
        <Outlet />
      </LangContext.Provider>
    ),
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });

  const changelogRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/changelog",
    component: () => null,
  });

  return rootRoute.addChildren([indexRoute, changelogRoute]);
}

type TestRouter = ReturnType<typeof createRouter>;

function createTestRouter(
  initialEntry: string,
  contentLang: Lang,
  navigationLang: Lang
): TestRouter {
  return createRouter({
    routeTree: makeRouteTree(contentLang, navigationLang),
    isServer: false,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

/**
 * The logo link, matched by a predicate rather than a regex: `getByRole`
 * compares a RegExp with `instanceof RegExp` across the ESM/CJS boundary, so a
 * regex name silently matches nothing here.
 */
function logoLink(): HTMLElement {
  return screen.getByRole("link", {
    name: (name) => name.startsWith("AI;DR"),
  });
}

/** The href the real `Link` renders for the logo. */
function logoHref(): string {
  return logoLink().getAttribute("href") ?? "";
}

async function renderBrandOn(router: TestRouter) {
  await router.load();
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(router.state.status).toBe("idle"));
}

function clearPreference() {
  // biome-ignore lint/suspicious/noDocumentCookie: clear the sanitized test preference
  document.cookie = "news_lang=; Max-Age=0; path=/";
  localStorage.clear();
}

beforeEach(() => {
  vi.mocked(track).mockClear();
  clearPreference();
});

afterEach(() => {
  cleanup();
  clearPreference();
});

describe("Brand home navigation", () => {
  it.each([
    ["en", "en"],
    ["vi", "vi"],
  ] as const)(
    "builds a canonical ?lang=%s logo href",
    async (contentLang, navigationLang) => {
      // Start on another route carrying a stale legacy alias, which is the
      // state that used to leak a `locale` param into the logo link.
      const router = createTestRouter(
        "/changelog?locale=fr",
        contentLang,
        navigationLang
      );
      await renderBrandOn(router);

      const href = logoHref();
      expect(href).toBe(`/?lang=${navigationLang}`);
      expect(href).not.toContain("payload");
      expect(href).not.toContain("locale");
      // Exactly one search param, so nothing rides along invisibly.
      expect([...new URLSearchParams(href.split("?")[1] ?? "").keys()]).toEqual(
        ["lang"]
      );
    }
  );

  it("agrees with the href the router itself would build", async () => {
    for (const navigationLang of ["en", "vi"] as const) {
      const router = createTestRouter("/", navigationLang, navigationLang);
      await renderBrandOn(router);

      const expected = router.buildLocation({
        to: "/",
        search: { lang: navigationLang },
      });
      expect(logoHref()).toBe(expected.href);
      cleanup();
    }
  });

  it("uses the navigation locale for a page whose copy is Vietnamese", async () => {
    // The header copy is Vietnamese while the user is browsing in English.
    // The link must follow the navigation locale, not the copy.
    const router = createTestRouter("/", "vi", "en");
    await renderBrandOn(router);

    expect(logoHref()).toBe("/?lang=en");
    expect(logoLink().textContent).toContain("Hôm nay AI có gì mới?");
  });

  it("lands on the home route with only the locale in the search state", async () => {
    const router = createTestRouter("/changelog?locale=vi", "en", "vi");
    await renderBrandOn(router);

    // Click the real link and let the real router resolve it, so this covers
    // search validation and the search middleware on the way through.
    logoLink().click();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));

    const { pathname, searchStr } = router.state.location;
    expect(pathname).toBe("/");
    expect(searchStr).toBe("?lang=vi");
    expect([...new URLSearchParams(searchStr).keys()]).toEqual(["lang"]);
    expect(router.state.status).toBe("idle");
    expect(
      router.state.matches.every((match) => match.status === "success")
    ).toBe(true);
  });

  it("leaves no router payload behind after navigating home", async () => {
    const router = createTestRouter("/changelog?locale=vi", "en", "vi");
    await renderBrandOn(router);

    logoLink().click();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));

    const { location } = router.state;
    expect(location.href).toBe("/?lang=vi");
    expect(JSON.stringify(location.state ?? {})).not.toContain("payload");
    expect(JSON.stringify(location.state ?? {})).not.toContain("locale");
    expect(track).toHaveBeenCalledWith("nav_click", { to: "/" });
  });

  it("keeps the logo destination stable as the current locale flips", async () => {
    // The header is rendered from several public routes; the link must not
    // depend on which one is mounted or on router history left by a previous
    // navigation.
    const router = createTestRouter("/", "vi", "vi");
    await renderBrandOn(router);
    expect(logoHref()).toBe("/?lang=vi");

    await router.navigate({ to: "/changelog", search: { lang: "en" } });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/changelog")
    );
    // The Brand link is memoized on the navigation locale, not on history.
    expect(logoHref()).toBe("/?lang=vi");
  });
});
