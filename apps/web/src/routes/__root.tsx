import "@aidr/ui/styles.css";
import "../styles.css";

import { ErrorBoundary } from "@aidr/ui";
import Analytics from "@aidr/ui/Analytics";
import ThemeProvider from "@aidr/ui/ThemeProvider";
import { track } from "@aidr/ui/track";
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import {
  BarChart3,
  ExternalLink,
  GitFork,
  History,
  Info,
  type LucideIcon,
  Mail,
  Plug,
  Puzzle,
  Scale,
  Send,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { HeaderBar } from "../components/HeaderBar";
import { NotFoundPage } from "../components/NotFoundPage";
import { ClerkModuleContext, getClerkModuleState } from "../lib/clerk-user";
import { fetchFeedOnce, getCachedFeed } from "../lib/feed-cache";
import { splatOwnsDocumentTitle } from "../lib/html-title";
import { getClientLang, setClientLang, timeAgo } from "../lib/lang";
import { LangContext } from "../lib/lang-context";
import {
  DEFAULT_PREFS,
  loadPrefs,
  type Prefs,
  PrefsContext,
  readerCssVars,
  savePrefs,
} from "../lib/prefs";
import {
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
  TELEGRAM_URL,
} from "../lib/site";
import type { Lang } from "../lib/types";

/**
 * Mounts the ONE app-wide <ClerkProvider> (static import for SSR — required
 * by @clerk/tanstack-react-start SignIn/SignUp). Consumers share it via
 * ClerkModuleContext; a second <ClerkProvider> crashes the app. If Clerk
 * fails, ErrorBoundary degrades to children with no Clerk context.
 */
function ClerkRootProvider({ children }: { children: ReactNode }) {
  const clerkState = getClerkModuleState();
  const withoutProvider = (
    <ClerkModuleContext.Provider
      value={{ mod: null, publishableKey: clerkState.publishableKey }}
    >
      {children}
    </ClerkModuleContext.Provider>
  );

  if (!clerkState.mod || !clerkState.publishableKey) return withoutProvider;

  return (
    <ErrorBoundary fallback={withoutProvider}>
      <ClerkModuleContext.Provider value={clerkState}>
        <clerkState.mod.ClerkProvider
          publishableKey={clerkState.publishableKey}
          appearance={{
            variables: {
              colorPrimary: "oklch(0.555 0.163 48.998)",
              borderRadius: "0.625rem",
            },
          }}
        >
          {children}
        </clerkState.mod.ClerkProvider>
      </ClerkModuleContext.Provider>
    </ErrorBoundary>
  );
}

// Footer is always English, regardless of site language.
const FOOTER_LINKS: {
  to: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { to: "/about", label: "About", icon: Info },
  { to: "/extension", label: "Chrome tab", icon: Puzzle },
  { to: "/privacy", label: "Privacy", icon: Scale },
  { to: "/subscribe", label: "Subscribe", icon: Mail },
  { to: "/mcp", label: "MCP", icon: Plug },
  {
    to: "/data",
    label: "Data",
    icon: BarChart3,
  },
  {
    to: "/changelog",
    label: "Changelog",
    icon: History,
  },
];

function NewsFooter() {
  const year = new Date().getFullYear();
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(
    () => getCachedFeed()?.lastFetchedAt ?? null
  );

  useEffect(() => {
    if (lastFetchedAt !== null) return;
    let cancelled = false;
    fetchFeedOnce().then((feed) => {
      if (!cancelled && feed?.lastFetchedAt)
        setLastFetchedAt(feed.lastFetchedAt);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <footer className="border-t border-border py-6 text-xs text-muted-foreground">
      <div className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 lg:px-8">
        <span>
          {`© ${year} Duyet Le · aidr.today — AI news, rated & ranked by LLMs`}
          {lastFetchedAt !== null && (
            <>
              {" · "}
              Updated {timeAgo(lastFetchedAt, Date.now(), "en")}
            </>
          )}
        </span>
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => track("nav_click", { to: link.to })}
              className="flex items-center gap-1 hover:text-accent hover:underline hover:underline-offset-2"
            >
              <link.icon className="h-3.5 w-3.5" aria-hidden />
              {link.label}
            </Link>
          ))}
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("nav_click", { to: "telegram" })}
            className="flex items-center gap-1 hover:text-accent hover:underline hover:underline-offset-2"
            aria-label="Telegram"
            title="Telegram"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
          </a>
          <a
            href="https://github.com/duyet/aidr"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("nav_click", { to: "github" })}
            className="flex items-center gap-1 hover:text-accent hover:underline hover:underline-offset-2"
          >
            <GitFork className="h-3.5 w-3.5" aria-hidden />
            GitHub
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          {" · "}
          <a
            href="https://anyrouter.dev/?ref=aidr.today"
            target="_blank"
            rel="noopener"
            onClick={() => track("nav_click", { to: "anyrouter" })}
            className="flex items-center gap-1 hover:text-accent hover:underline hover:underline-offset-2"
          >
            AnyRouter
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </nav>
      </div>
    </footer>
  );
}

export const Route = createRootRoute({
  head: ({ matches }) => {
    const notFoundOwnsTitle = splatOwnsDocumentTitle(
      matches.map((m) => ({
        id: (m as { id?: string }).id,
        routeId: (m as { routeId?: string }).routeId,
      }))
    );
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1.0" },
        {
          name: "robots",
          content: notFoundOwnsTitle ? "noindex, follow" : "follow, index",
        },
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
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "preload",
          as: "style",
          href: "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&display=swap",
        },
        {
          rel: "preload",
          as: "style",
          href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&display=swap",
        },
      ],
    };
  },
  notFoundComponent: NotFoundPage,
  component: RootComponent,
});

function PageViewTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    track("page_view", { page_path: pathname });
  }, [pathname]);

  return null;
}

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
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&display=swap"
          media="print"
          // @ts-expect-error onLoad is valid on link elements
          onLoad="this.media='all'"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&display=swap"
          media="print"
          // @ts-expect-error onLoad is valid on link elements
          onLoad="this.media='all'"
        />
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

                    <main className="mx-auto w-full max-w-[1080px] flex-grow px-4 pb-16 sm:px-6 lg:px-8">
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
