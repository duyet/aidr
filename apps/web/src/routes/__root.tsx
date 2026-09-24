import "@aidr/ui/styles.css";
import "../styles.css";

import Analytics from "@aidr/ui/Analytics";
import ThemeProvider from "@aidr/ui/ThemeProvider";
import { track } from "@aidr/ui/track";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ClerkRootProvider } from "../components/ClerkRootProvider";
import { HeaderBar } from "../components/HeaderBar";
import { NewsFooter } from "../components/NewsFooter";
import { NotFoundPage } from "../components/NotFoundPage";
import { PageViewTracker } from "../components/PageViewTracker";
import { splatOwnsDocumentTitle } from "../lib/html-title";
import { getClientLang, setClientLang } from "../lib/lang";
import { LangContext } from "../lib/lang-context";
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

export const Route = createRootRoute({
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
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1.0, viewport-fit=cover",
        },
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
  const [lang, setLang] = useState<Lang>(() => getClientLang());

  const handleLangChange = (next: Lang) => {
    setClientLang(next);
    setLang(next);
    track("lang_change", { lang: next });
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
        <LangContext.Provider value={lang}>
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
