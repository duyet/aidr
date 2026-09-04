"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Icons from "../Icons";

/** Minimal redirect config — avoids a @duyet/urls dependency. */
export type UrlsConfig = {
  apps?: {
    blog?: string;
  };
};

// Track whether a ClerkProvider already exists in the page
let clerkProviderMounted = false;

type ClerkLike = {
  ClerkProvider?: (props: {
    publishableKey: string;
    children?: ReactNode;
  }) => ReactNode;
  SignedOut?: (props: { children?: ReactNode }) => ReactNode;
  SignedIn?: (props: { children?: ReactNode }) => ReactNode;
  Show?: (props: {
    when: "signed-in" | "signed-out";
    children?: ReactNode;
  }) => ReactNode;
  SignInButton?: (props: {
    mode?: "modal" | "redirect";
    forceRedirectUrl?: string;
    children?: ReactNode;
  }) => ReactNode;
  SignUpButton?: (props: {
    mode?: "modal" | "redirect";
    forceRedirectUrl?: string;
    children?: ReactNode;
  }) => ReactNode;
  UserButton?: (props: {
    appearance?: { elements?: { avatarBox?: string } };
    afterSignOutUrl?: string;
  }) => ReactNode;
};

/**
 * Auth button component for user authentication.
 *
 * Features:
 * - Dynamic Clerk import (only loads when key is present)
 * - Singleton guard for pages with multiple headers
 * - Optional urls config (defaults to current page for redirects)
 * - Customizable styling
 * - Auto-redirect back to current page after sign in/out
 * - Optional signedInContent for authenticated-only features
 * - Optional wrapWithProvider for apps with existing ClerkProvider
 */
export function AuthButtons({
  urls,
  className = "",
  signInClassName = "rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:border-foreground transition-colors",
  avatarSize = "h-8 w-8",
  signedInContent = null,
  signedOutContent = null,
  wrapWithProvider = true,
  clerkModule: providedModule = null,
}: {
  urls?: UrlsConfig;
  className?: string;
  signInClassName?: string;
  avatarSize?: string;
  signedInContent?: ReactNode | null;
  signedOutContent?: ReactNode | null;
  wrapWithProvider?: boolean;
  /** Host Clerk module. Typed loosely so SDK provider props can drift. */
  clerkModule?: object | null;
} = {}) {
  const importMetaEnv =
    typeof import.meta !== "undefined"
      ? ((import.meta as unknown as Record<string, unknown>).env as
          | Record<string, string>
          | undefined)
      : undefined;
  const publishableKey = importMetaEnv?.VITE_CLERK_PUBLISHABLE_KEY;

  const [ownModule, setOwnModule] = useState<ClerkLike | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const isOwner = useRef(false);

  // When the host app owns the <ClerkProvider> it must hand us the very
  // module that provider was mounted from. Importing our own copy here would
  // race the host: our import can resolve first and render auth gates
  // before any provider exists, which Clerk throws on.
  const hostOwnsProvider = !wrapWithProvider;
  const clerkModule = (
    hostOwnsProvider ? providedModule : ownModule
  ) as ClerkLike | null;

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  useEffect(() => {
    if (!publishableKey) return;
    if (hostOwnsProvider) return;

    if (clerkProviderMounted) return;
    clerkProviderMounted = true;
    isOwner.current = true;

    import("@clerk/tanstack-react-start")
      .then((mod) => setOwnModule(mod as ClerkLike))
      .catch(() => {
        // Clerk not available — isOwner stays true so fallback renders
      });

    return () => {
      if (isOwner.current) {
        clerkProviderMounted = false;
      }
    };
  }, [publishableKey, hostOwnsProvider]);

  if (!publishableKey) {
    return (
      <button
        type="button"
        className={`${signInClassName} ${className}`.trim()}
        aria-label="Sign in (Unavailable)"
      >
        <Icons.UserEmpty className="h-4 w-4" />
      </button>
    );
  }

  if (!clerkModule || (!hostOwnsProvider && !isOwner.current)) {
    return null;
  }

  const {
    ClerkProvider,
    SignedOut,
    SignedIn,
    Show,
    SignInButton,
    SignUpButton,
    UserButton,
  } = clerkModule;

  const GateOut =
    Show != null
      ? ({ children }: { children?: ReactNode }) => (
          <Show when="signed-out">{children}</Show>
        )
      : SignedOut;
  const GateIn =
    Show != null
      ? ({ children }: { children?: ReactNode }) => (
          <Show when="signed-in">{children}</Show>
        )
      : SignedIn;

  if (!ClerkProvider || !GateOut || !GateIn || !SignInButton || !UserButton) {
    return (
      <button
        type="button"
        className={`${signInClassName} ${className}`.trim()}
        aria-label="Sign in (Unavailable)"
      >
        <Icons.UserEmpty className="h-4 w-4" />
      </button>
    );
  }

  const redirectUrl = currentUrl || urls?.apps?.blog || "https://aidr.today";

  const content = (
    <>
      {signedOutContent && <GateOut>{signedOutContent}</GateOut>}
      {signedInContent && <GateIn>{signedInContent}</GateIn>}
      <GateOut>
        <div className={`flex items-center gap-1.5 ${className}`.trim()}>
          <SignInButton mode="modal" forceRedirectUrl={redirectUrl}>
            <button
              type="button"
              className={
                signInClassName ||
                "rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:border-foreground transition-colors"
              }
              aria-label="Sign in"
            >
              Sign in
            </button>
          </SignInButton>
          {SignUpButton ? (
            <SignUpButton mode="modal" forceRedirectUrl={redirectUrl}>
              <button
                type="button"
                className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background hover:opacity-90 transition-opacity"
                aria-label="Sign up"
              >
                Sign up
              </button>
            </SignUpButton>
          ) : null}
        </div>
      </GateOut>
      <GateIn>
        <UserButton
          appearance={{
            elements: {
              avatarBox: avatarSize,
            },
          }}
          afterSignOutUrl={redirectUrl}
        />
      </GateIn>
    </>
  );

  return wrapWithProvider ? (
    <ClerkProvider publishableKey={publishableKey}>{content}</ClerkProvider>
  ) : (
    content
  );
}
