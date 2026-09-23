import { ErrorBoundary } from "@aidr/ui";
import type { ReactNode } from "react";
import { CLERK_PROXY_URL } from "../../worker/clerk-proxy";
import { ClerkModuleContext, getClerkModuleState } from "../lib/clerk-user";

/**
 * Mounts the ONE app-wide <ClerkProvider> (static import for SSR — required
 * by @clerk/tanstack-react-start SignIn/SignUp). Consumers share it via
 * ClerkModuleContext; a second <ClerkProvider> crashes the app. If Clerk
 * fails, ErrorBoundary degrades to children with no Clerk context.
 */
export function ClerkRootProvider({ children }: { children: ReactNode }) {
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
