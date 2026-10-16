import { ErrorBoundary } from "@aidr/ui";
import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { resolveClerkProxyUrl } from "../lib/clerk-proxy-config";
import {
  type ClerkModule,
  ClerkModuleContext,
  getClerkPublishableKey,
  hasClerkSessionCookie,
  loadClerkModule,
  routeNeedsClerk,
} from "../lib/clerk-user";
import { useLang } from "../lib/lang-context";
import { withLang } from "../lib/locale-url";
import type { Lang } from "../lib/types";

const CLERK_LOCALIZATION: Record<Lang, { locale: Lang }> = {
  en: { locale: "en" },
  vi: { locale: "vi" },
};

/**
 * The installed Clerk provider updates its existing singleton options when
 * the localization object identity changes. Keep one object per locale so a
 * locale change refreshes every redirect option without remounting the app.
 */
export function clerkProviderLocaleOptions(lang: Lang) {
  return {
    localization: CLERK_LOCALIZATION[lang],
    signInUrl: withLang("/sign-in", lang),
    signUpUrl: withLang("/sign-up", lang),
    signInFallbackRedirectUrl: withLang("/", lang),
    signUpFallbackRedirectUrl: withLang("/", lang),
  };
}

/**
 * Mounts the ONE app-wide <ClerkProvider> (deferred — the Clerk SDK is
 * dynamically imported only once something can need it: a session cookie,
 * a route that mounts Clerk UI, or the visitor's first pointer/key
 * interaction. Most readers are signed out and never interact, so they skip
 * the ~330KB gzip SDK entirely; it stays out of SSR). Children render
 * immediately with `mod: null`; every consumer handles that fallback. When the import
 * resolves the provider is inserted above children, which remounts the
 * subtree — consumers then see the shared module via ClerkModuleContext.
 * A second <ClerkProvider> crashes the app; if Clerk fails, ErrorBoundary
 * degrades to children with no Clerk context.
 */
export function ClerkRootProvider({ children }: { children: ReactNode }) {
  const publishableKey = getClerkPublishableKey();
  const navigationLang = useLang();
  const localeOptions = clerkProviderLocaleOptions(navigationLang);
  const proxyUrl = resolveClerkProxyUrl(import.meta.env.CLERK_PROXY_URL);
  const [mod, setMod] = useState<ClerkModule | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [wanted, setWanted] = useState(false);

  useEffect(() => {
    if (!publishableKey || wanted) return;
    if (hasClerkSessionCookie(document.cookie) || routeNeedsClerk(pathname)) {
      setWanted(true);
      return;
    }
    const arm = () => setWanted(true);
    const opts = { once: true, passive: true } as const;
    window.addEventListener("pointerdown", arm, opts);
    window.addEventListener("keydown", arm, opts);
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, [publishableKey, pathname, wanted]);

  useEffect(() => {
    if (!publishableKey || !wanted) return;
    let cancelled = false;
    loadClerkModule()
      .then((m) => {
        if (!cancelled) setMod(m);
      })
      .catch(() => {
        // Import failed — keep rendering the no-Clerk fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [publishableKey, wanted]);

  const withoutProvider = (
    <ClerkModuleContext.Provider value={{ mod: null, publishableKey }}>
      {children}
    </ClerkModuleContext.Provider>
  );

  // Local dev may run without the proxy (clerkProxyUrlForMode); deployed
  // builds always carry one.
  if (!mod || !publishableKey || (!proxyUrl && !import.meta.env.DEV)) {
    return withoutProvider;
  }

  return (
    <ErrorBoundary fallback={withoutProvider}>
      <ClerkModuleContext.Provider value={{ mod, publishableKey }}>
        <mod.ClerkProvider
          publishableKey={publishableKey}
          // Environment-specific absolute URL; never derive this from Host.
          proxyUrl={proxyUrl}
          {...localeOptions}
          appearance={{
            variables: {
              colorPrimary: "oklch(0.555 0.163 48.998)",
              borderRadius: "0.625rem",
            },
          }}
        >
          {children}
        </mod.ClerkProvider>
      </ClerkModuleContext.Provider>
    </ErrorBoundary>
  );
}
