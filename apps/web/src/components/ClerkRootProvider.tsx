import { ErrorBoundary } from "@aidr/ui";
import { type ReactNode, useEffect, useState } from "react";
import { CLERK_PROXY_URL } from "../../worker/clerk-proxy";
import {
  type ClerkModule,
  ClerkModuleContext,
  getClerkPublishableKey,
  loadClerkModule,
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
 * dynamically imported after first paint so its ~160KB chunk stays off the
 * critical path and out of SSR). Children render immediately with
 * `mod: null`; every consumer handles that fallback. When the import
 * resolves the provider is inserted above children, which remounts the
 * subtree — consumers then see the shared module via ClerkModuleContext.
 * A second <ClerkProvider> crashes the app; if Clerk fails, ErrorBoundary
 * degrades to children with no Clerk context.
 */
export function ClerkRootProvider({ children }: { children: ReactNode }) {
  const publishableKey = getClerkPublishableKey();
  const navigationLang = useLang();
  const localeOptions = clerkProviderLocaleOptions(navigationLang);
  const [mod, setMod] = useState<ClerkModule | null>(null);

  useEffect(() => {
    if (!publishableKey) return;
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
  }, [publishableKey]);

  const withoutProvider = (
    <ClerkModuleContext.Provider value={{ mod: null, publishableKey }}>
      {children}
    </ClerkModuleContext.Provider>
  );

  if (!mod || !publishableKey) return withoutProvider;

  return (
    <ErrorBoundary fallback={withoutProvider}>
      <ClerkModuleContext.Provider value={{ mod, publishableKey }}>
        <mod.ClerkProvider
          publishableKey={publishableKey}
          // Absolute URL so handshake redirects never fall back to the
          // publishable-key host (clerk.aidr.today → CF Error 1000).
          proxyUrl={CLERK_PROXY_URL}
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
