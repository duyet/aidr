import "@aidr/ui/styles.css";
import "../styles.css";

import Analytics from "@aidr/ui/Analytics";
import ThemeProvider from "@aidr/ui/ThemeProvider";
import { track } from "@aidr/ui/track";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ClerkRootProvider } from "../components/ClerkRootProvider";
import { HeaderBar } from "../components/HeaderBar";
import { NewsFooter } from "../components/NewsFooter";
import { NotFoundPage } from "../components/NotFoundPage";
import { PageViewTracker } from "../components/PageViewTracker";
import { splatOwnsDocumentTitle } from "../lib/html-title";
import { setClientLang } from "../lib/lang";
import { LangContext } from "../lib/lang-context";
import {
  InvalidLocaleRequestError,
  isLanguageNeutralSsrPath,
  isPrivateSsrPath,
  preserveRootLangFromMiddleware,
  validateRootSearch,
} from "../lib/locale-routing";
import {
  canonicalLocaleRedirect,
  hasLocaleQuery,
  neutralLocaleRedirect,
  withLang,
} from "../lib/locale-url";
import { loadRequestLocale } from "../lib/not-found-fn";
import {
  DEFAULT_PREFS,
  loadPrefs,
  type Prefs,
  PrefsContext,
  readerCssVars,
  savePrefs,
} from "../lib/prefs";
import { getRouteSearch, unavailableRouteSearch } from "../lib/route-search";
import { routeRobotsMeta } from "../lib/seo";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "../lib/site";
import type { Lang } from "../lib/types";
import { VIEWPORT_META_CONTENT } from "../lib/viewport";

export const Route = createRootRoute({
  validateSearch: validateRootSearch,
  search: {
    // Neutral child routes expose removal metadata so the root rule does not
    // re-add a locale that the child already normalized away.
    middlewares: [
      ({ search, next }) => preserveRootLangFromMiddleware(search, next),
    ],
  },
  beforeLoad: async ({ location }) => {
    const resolution = await loadRequestLocale(location.searchStr);
    if (!resolution.ok) throw new InvalidLocaleRequestError(resolution);

    const neutral = isLanguageNeutralSsrPath(location.pathname);
    const privateRoute = isPrivateSsrPath(
      location.pathname,
      location.searchStr
    );
    if (neutral && !privateRoute) {
      if (hasLocaleQuery(location.searchStr)) {
        const href = neutralLocaleRedirect(
          location.pathname,
          location.searchStr,
          location.hash
        );
        if (href) {
          if (resolution.explicit) setClientLang(resolution.lang);
          throw redirect({ href, statusCode: 307 });
        }
      }
      return { lang: "en" as const, navigationLang: resolution.lang };
    }

    if (resolution.legacy) {
      const href = canonicalLocaleRedirect(
        location.pathname,
        location.searchStr,
        location.hash,
        resolution.lang
      );
      if (href) throw redirect({ href, statusCode: 307 });
    }
    return {
      lang: neutral ? ("en" as const) : resolution.lang,
      navigationLang: resolution.lang,
    };
  },
  head: ({ matches }) => {
    const notFoundOwnsTitle = splatOwnsDocumentTitle(
      matches.map((m) => ({
        id: (m as { id?: string }).id,
        routeId: (m as { routeId?: string }).routeId,
      }))
    );
    const activeMatch = matches[matches.length - 1];
    const search = (() => {
      try {
        return getRouteSearch();
      } catch {
        return unavailableRouteSearch();
      }
    })();
    const routeStatus =
      activeMatch?.status === "notFound"
        ? 404
        : activeMatch?.status === "error"
          ? 500
          : undefined;
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: VIEWPORT_META_CONTENT },
        routeRobotsMeta({
          pathname: activeMatch?.pathname ?? "/",
          search,
          status: routeStatus,
        }),
        // Catch-all owns head() + Worker 404 rewrite. Emitting SITE_TITLE
        // here would win over the splat's localized title.
        ...(notFoundOwnsTitle ? [] : [{ title: SITE_TITLE }]),
        {
          name: "description",
          content: SITE_DESCRIPTION,
        },
      ],
      links: [
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        {
          rel: "sitemap",
          type: "application/xml",
          href: `${SITE_URL}/sitemap.xml`,
        },
      ],
    };
  },
  notFoundComponent: NotFoundPage,
  component: RootComponent,
});

function RootComponent() {
  const routeContext = Route.useRouteContext();
  const [lang, setLang] = useState<Lang>(routeContext.lang);
  const navigationLang = routeContext.navigationLang ?? routeContext.lang;
  const navigate = useNavigate();

  useEffect(() => {
    setLang(routeContext.lang);
  }, [routeContext.lang]);

  const handleLangChange = (next: Lang) => {
    setClientLang(next);
    setLang(next);
    track("lang_change", { lang: next });
    if (typeof window !== "undefined") {
      const current = new URL(window.location.href);
      const href = withLang(
        `${current.pathname}${current.search}${current.hash}`,
        next
      );
      void navigate({ href, replace: true });
    }
  };

  // Render defaults on the server / first client paint to avoid a hydration
  // mismatch, then apply anything persisted in localStorage once mounted.
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const prefsLoadedRef = useRef(false);

  useEffect(() => {
    setPrefsState(loadPrefs());
    prefsLoadedRef.current = true;
  }, []);

  useEffect(() => {
    if (!prefsLoadedRef.current) return;
    savePrefs(prefs);
  }, [prefs]);

  const setPrefs = (update: Partial<Prefs>) =>
    setPrefsState((p) => ({ ...p, ...update }));

  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <LangContext.Provider value={navigationLang}>
          <PrefsContext.Provider value={{ prefs, setPrefs }}>
            <ThemeProvider>
              <ClerkRootProvider>
                <div
                  className="app-shell relative flex min-h-screen flex-col justify-between overflow-x-hidden bg-background text-foreground selection:bg-foreground selection:text-background"
                  data-reader-bg={prefs.bg}
                  suppressHydrationWarning
                >
                  {/* Amber brand accent + compact reader typography are scoped
                      to .news-content (HeaderBar + main). The reader background
                      swatch is on .app-shell so it paints the whole page. */}
                  <div
                    className="news-content relative z-10 flex flex-grow flex-col"
                    style={readerCssVars(prefs)}
                    data-reader-font={prefs.font}
                  >
                    <HeaderBar lang={lang} onLangChange={handleLangChange} />

                    <main className="mx-auto flex w-full max-w-[1080px] flex-grow flex-col px-4 pb-16 sm:px-6 lg:px-8">
                      <Outlet />
                    </main>
                  </div>

                  <NewsFooter />
                </div>
              </ClerkRootProvider>
            </ThemeProvider>
          </PrefsContext.Provider>
        </LangContext.Provider>
        <Analytics />
        <PageViewTracker />
        <Scripts />
      </body>
    </html>
  );
}
