/** @vitest-environment happy-dom */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  stripSearchParams,
} from "@tanstack/react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveLocale } from "./lang";
import {
  preserveRootLangFromMiddleware,
  type RootSearch,
} from "./locale-routing";
import { neutralLocaleRedirect } from "./locale-url";
import type { Lang } from "./types";

interface DataSearch {
  tab?: "overview" | "algo";
}

const rootRoute = createRootRoute({
  validateSearch: (search: Record<string, unknown>): RootSearch => ({
    ...(search.lang === "en" || search.lang === "vi"
      ? { lang: search.lang }
      : {}),
    ...(typeof search.locale === "string" ? { locale: search.locale } : {}),
  }),
  search: {
    middlewares: [
      ({ search, next }) => preserveRootLangFromMiddleware(search, next),
    ],
  },
  beforeLoad: ({ location }) => {
    const resolution = resolveLocale({
      search: location.searchStr,
      cookie: document.cookie,
    });
    if (!resolution.ok) throw new Error(resolution.message);
    if (location.pathname === "/data" && location.searchStr) {
      const href = neutralLocaleRedirect(
        location.pathname,
        location.searchStr,
        location.hash
      );
      if (href) throw redirect({ href, statusCode: 307 });
    }
    return { lang: "en" as const, navigationLang: resolution.lang };
  },
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
});

const dataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/data",
  validateSearch: (search: Record<string, unknown>): DataSearch => ({
    ...(search.tab === "overview" || search.tab === "algo"
      ? { tab: search.tab }
      : {}),
  }),
  search: {
    middlewares: [
      stripSearchParams<DataSearch & RootSearch>(["lang", "locale"]),
    ],
  },
});

const routeTree = rootRoute.addChildren([indexRoute, dataRoute]);

function createTestRouter(lang: Lang = "vi") {
  return createRouter({
    routeTree,
    isServer: false,
    history: createMemoryHistory({ initialEntries: [`/?lang=${lang}`] }),
  });
}

describe("locale-aware client navigation", () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: clear the sanitized test preference
    document.cookie = "news_lang=; Max-Age=0; path=/";
    localStorage.clear();
  });

  it.each(["vi", "en"] as const)(
    "strips a preserved %s locale before a neutral route can redirect again",
    async (lang) => {
      const router = createTestRouter(lang);
      await router.load();

      await router.navigate({ to: "/data", search: {} });

      expect(router.state.location.href).toBe("/data");
      expect(router.state.status).toBe("idle");
      expect(document.cookie).toContain(`news_lang=${lang}`);
      expect(
        router.state.matches.every((match) => match.status === "success")
      ).toBe(true);
    }
  );

  it("persists an explicit destination locale before neutral stripping", async () => {
    const router = createTestRouter("vi");
    await router.load();

    await router.navigate({
      to: "/data",
      search: { lang: "en" } as DataSearch & RootSearch,
    });

    expect(router.state.location.href).toBe("/data");
    expect(document.cookie).toContain("news_lang=en");
  });

  it("keeps a data tab while removing the neutral locale", async () => {
    const router = createTestRouter();
    await router.load();

    await router.navigate({ to: "/data", search: { tab: "algo" } });

    expect(router.state.location.href).toBe("/data?tab=algo");
    expect(router.state.status).toBe("idle");
    expect(
      router.state.matches.every((match) => match.status === "success")
    ).toBe(true);
  });
});
