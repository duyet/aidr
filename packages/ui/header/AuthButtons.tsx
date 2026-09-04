"use client";

import { useEffect, useRef, useState } from "react";
import Icons from "../Icons";

/** Minimal redirect config — avoids a @duyet/urls dependency. */
export type UrlsConfig = {
  apps?: {
    blog?: string;
  };
};

// Track whether a ClerkProvider already exists in the page
let clerkProviderMounted = false;

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
  signInClassName = "h-8 w-8 flex items-center justify-center rounded-full text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors",
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
  signedInContent?: React.ReactNode | null;
  signedOutContent?: React.ReactNode | null;
  wrapWithProvider?: boolean;
  clerkModule?: any;
} = {}) {
  const importMetaEnv =
    typeof import.meta !== "undefined"
      ? ((import.meta as unknown as Record<string, unknown>).env as
          | Record<string, string>
          | undefined)
      : undefined;
  const publishableKey = importMetaEnv?.VITE_CLERK_PUBLISHABLE_KEY;

  const [ownModule, setOwnModule] = useState<any>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const isOwner = useRef(false);

  // When the host app owns the <ClerkProvider> it must hand us the very
  // module that provider was mounted from. Importing our own copy here would
  // race the host: our import can resolve first and render <SignedOut />
  // before any provider exists, which Clerk throws on.
  const hostOwnsProvider = !wrapWithProvider;
  const clerkModule = hostOwnsProvider ? providedModule : ownModule;

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  useEffect(() => {
    if (!publishableKey) return;
    if (hostOwnsProvider) return;

    if (clerkProviderMounted) return;
    clerkProviderMounted = true;
    isOwner.current = true;

    import("@clerk/clerk-react")
      .then((mod) => setOwnModule(mod))
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

  const { ClerkProvider, SignedOut, SignedIn, SignInButton, UserButton } =
    clerkModule;

  if (
    !ClerkProvider ||
    !SignedOut ||
    !SignedIn ||
    !SignInButton ||
    !UserButton
  ) {
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

  const redirectUrl =
    currentUrl || urls?.apps?.blog || "https://blog.duyet.net";

  const content = (
    <>
      {signedOutContent && <SignedOut>{signedOutContent}</SignedOut>}
      {signedInContent && <SignedIn>{signedInContent}</SignedIn>}
      <SignedOut>
        <SignInButton mode="modal" redirectUrl={redirectUrl}>
          <button
            type="button"
            className={`${signInClassName} ${className}`.trim()}
            aria-label="Sign in"
          >
            <Icons.UserEmpty className="h-4 w-4" />
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton
          appearance={{
            elements: {
              avatarBox: avatarSize,
            },
          }}
          afterSignOutUrl={redirectUrl}
        />
      </SignedIn>
    </>
  );

  return wrapWithProvider ? (
    <ClerkProvider publishableKey={publishableKey}>{content}</ClerkProvider>
  ) : (
    content
  );
}
