import { ErrorBoundary } from "@aidr/ui";
import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { resolveClerkProxyUrl } from "../lib/clerk-proxy-config";
import {
  type ClerkModule,
  ClerkModuleContext,
  getClerkPublishableKey,
  loadClerkModule,
  shouldMountClerk,
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
 * Mounts the ONE app-wide <ClerkProvider>. The SDK is dynamically imported,
 * and the provider inserted, only when `shouldMountClerk` says so: a session
 * cookie or a route that renders Clerk UI, re-checked on every navigation.
 * Inserting the provider changes the element above `children`, so React
 * remounts the whole page and drops open dialogs, expanded rows and pending
 * selections. Tying insertion to page-level facts keeps that remount at
 * hydration or at a navigation, never after a hover or a tap. Signed-out
 * controls may only `preloadClerk` (download without inserting) and send
 * the reader to /sign-in. Most readers never sign in, so they skip the
 * ~330 KB gzip SDK entirely. The SDK stays out of SSR. Children render
 * immediately with `mod: null`; every consumer handles that fallback. A
 * second <ClerkProvider> crashes the app; if Clerk fails, ErrorBoundary
 * degrades to children with no Clerk context.
 */
export function ClerkRootProvider({ children }: { children: ReactNode }) {
  const publishableKey = getClerkPublishableKey();
  const navigationLang = useLang();
  const localeOptions = clerkProviderLocaleOptions(navigationLang);
  const proxyUrl = resolveClerkProxyUrl(import.meta.env.CLERK_PROXY_URL);
  const [mod, setMod] = useState<ClerkModule | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const preloadClerk = useCallback(() => {
    if (publishableKey) loadClerkModule().catch(() => {});
  }, [publishableKey]);

  useEffect(() => {
    if (!publishableKey || mod) return;
    if (!shouldMountClerk(pathname, document.cookie)) return;
    let cancelled = false;
    loadClerkModule()
      .then((m) => {
        if (!cancelled) setMod(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publishableKey, pathname, mod]);

  const withoutProvider = (
    <ClerkModuleContext.Provider
      value={{ mod: null, publishableKey, preloadClerk }}
    >
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
      <ClerkModuleContext.Provider
        value={{ mod, publishableKey, preloadClerk }}
      >
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
