"use client";

import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import Icons from "../Icons";
import { Button } from "../ui/button";

/** Minimal redirect config — avoids a @duyet/urls dependency. */
export type UrlsConfig = {
  apps?: {
    blog?: string;
  };
};

// Track whether a ClerkProvider already exists in the page
let clerkProviderMounted = false;

type ClerkLike = {
  ClerkProvider?: ComponentType<{
    publishableKey: string;
    children?: ReactNode;
    appearance?: unknown;
  }>;
  SignedOut?: ComponentType<{ children?: ReactNode }>;
  SignedIn?: ComponentType<{ children?: ReactNode }>;
  Show?: ComponentType<{
    when: "signed-in" | "signed-out";
    children?: ReactNode;
  }>;
  SignInButton?: ComponentType<{
    mode?: "modal" | "redirect";
    forceRedirectUrl?: string;
    children?: ReactNode;
  }>;
  SignUpButton?: ComponentType<{
    mode?: "modal" | "redirect";
    forceRedirectUrl?: string;
    children?: ReactNode;
  }>;
  UserButton?: ComponentType<{
    appearance?: { elements?: { avatarBox?: string } };
    afterSignOutUrl?: string;
  }>;
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
  signInClassName,
  avatarSize = "size-7",
  signedInContent = null,
  signedOutContent = null,
  wrapWithProvider = true,
  clerkModule: providedModule = null,
  stacked = false,
}: {
  urls?: UrlsConfig;
  className?: string;
  signInClassName?: string;
  avatarSize?: string;
  signedInContent?: ReactNode | null;
  signedOutContent?: ReactNode | null;
  wrapWithProvider?: boolean;
  /** Host Clerk SDK module. Typed loosely so @clerk/* major bumps don't break the UI package. */
  clerkModule?: object | null;
  stacked?: boolean;
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        aria-label="Sign in (Unavailable)"
      >
        <Icons.UserEmpty className="size-4" />
      </Button>
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        aria-label="Sign in (Unavailable)"
      >
        <Icons.UserEmpty className="size-4" />
      </Button>
    );
  }

  const redirectUrl = currentUrl || urls?.apps?.blog || "https://aidr.today";

  const content = (
    <>
      {signedOutContent && <GateOut>{signedOutContent}</GateOut>}
      {signedInContent && <GateIn>{signedInContent}</GateIn>}
      <GateOut>
        <SignInButton mode="modal" forceRedirectUrl={redirectUrl}>
          <Button
            type="button"
            variant="outline"
            size={stacked ? "lg" : "sm"}
            className={
              stacked
                ? `w-full ${signInClassName ?? ""} ${className}`.trim()
                : `${signInClassName ?? ""} ${className}`.trim()
            }
            aria-label="Sign in"
          >
            Sign in
          </Button>
        </SignInButton>
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
