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
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { CLERK_PROXY_URL } from "../../worker/clerk-proxy";
import { HeaderBar } from "../components/HeaderBar";
import { NotFoundPage } from "../components/NotFoundPage";
import {
  campaignTrackParams,
  isEmailCampaign,
  isExtensionCampaign,
  resolveCampaign,
} from "../lib/campaign";
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
  DUYET_URL,
  EXTENSION_PATH,
  GITHUB_URL,
  SITE_DESCRIPTION,
  SITE_SLOGAN,
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
          // Absolute URL so handshake redirects never fall back to the
          // publishable-key host (clerk.aidr.today → CF Error 1000).
          proxyUrl={CLERK_PROXY_URL}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
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
const FOOTER_LINKS: { to: string; label: string }[] = [
  { to: "/about", label: "About" },
  { to: "/subscribe", label: "Subscribe" },
  { to: "/data", label: "Data / Pipeline" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
];

const linkClass =
  "text-sm text-muted-foreground transition-colors hover:text-foreground";

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
    <footer className="mt-10 border-t border-border/80 bg-card/40 py-12 text-sm text-muted-foreground">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="space-y-2">
            <p className="font-serif text-xl font-medium tracking-tight text-foreground">
              AI;DR
            </p>
            <p className="max-w-xs text-sm leading-relaxed">{SITE_SLOGAN}</p>
          </div>
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-3"
          >
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/90">
                Site
              </p>
              {FOOTER_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => track("nav_click", { to: link.to })}
                  className={`block ${linkClass}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/90">
                Connect
              </p>
              <Link
                to={EXTENSION_PATH}
                onClick={() => track("nav_click", { to: EXTENSION_PATH })}
                className={`block ${linkClass}`}
                title="Get AI;DR"
                aria-label="Get AI;DR"
              >
                Get AI;DR
              </Link>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("nav_click", { to: "telegram" })}
                className={`block ${linkClass}`}
              >
                Telegram
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("nav_click", { to: "github" })}
                className={`block ${linkClass}`}
              >
                GitHub
              </a>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
                More
              </p>
              <a
                href={DUYET_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("nav_click", { to: "duyet.net" })}
                className={`block ${linkClass}`}
              >
                duyet.net
              </a>
            </div>
          </nav>
        </div>
        <div className="flex flex-col gap-2 border-t border-border/60 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>
            {`© ${year} AI;DR`}
            {lastFetchedAt !== null && (
              <> · Updated {timeAgo(lastFetchedAt, Date.now(), "en")}</>
            )}
          </span>
        </div>
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
      ],
    };
  },
  notFoundComponent: NotFoundPage,
  component: RootComponent,
});

function PageViewTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const first = useRef(true);
  const landedExt = useRef(false);
  const landedEmail = useRef(false);

  useEffect(() => {
    const campaign = resolveCampaign({ search, pathname });
    const campaignParams = campaignTrackParams(campaign);

    if (!landedExt.current && isExtensionCampaign(campaign)) {
      landedExt.current = true;
      track("extension_landing", {
        ...campaignParams,
        page_path: pathname,
      });
    }

    if (!landedEmail.current && isEmailCampaign(campaign)) {
      landedEmail.current = true;
      track("email_click", {
        ...campaignParams,
        page_path: pathname,
      });
    }

    if (first.current) {
      // GA config already sends the initial page_view; enrich SPA navs only.
      first.current = false;
      // Still fire a dedicated first-touch attribution event when landing
      // with campaign params (covers hard loads where send_page_view raced).
      if (campaign && Object.keys(campaignParams).length > 0) {
        track("campaign_touch", {
          ...campaignParams,
          page_path: pathname,
        });
      }
      return;
    }

    track("page_view", {
      page_path: pathname,
      ...campaignParams,
    });
  }, [pathname, search]);

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
