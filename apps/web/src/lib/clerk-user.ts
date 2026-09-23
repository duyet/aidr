import type * as ClerkTanStack from "@clerk/tanstack-react-start";
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
} from "react";

type ClerkTanStackMod = typeof ClerkTanStack;

/** Compat shims — newer Clerk SDKs use `<Show when="signed-in|out">`. */
export type ClerkModule = ClerkTanStackMod & {
  SignedIn: (props: { children?: ReactNode }) => ReactNode;
  SignedOut: (props: { children?: ReactNode }) => ReactNode;
};

export interface ClerkModuleState {
  mod: ClerkModule | null;
  publishableKey: string | undefined;
}

const EMPTY_STATE: ClerkModuleState = { mod: null, publishableKey: undefined };

function withSignedInOutCompat(mod: ClerkTanStackMod): ClerkModule {
  function SignedIn({ children }: { children?: ReactNode }) {
    return createElement(mod.Show, { when: "signed-in" }, children);
  }
  function SignedOut({ children }: { children?: ReactNode }) {
    return createElement(mod.Show, { when: "signed-out" }, children);
  }
  return { ...mod, SignedIn, SignedOut };
}

let clerkModulePromise: Promise<ClerkModule> | null = null;

/**
 * Dynamic import keeps the ~160KB Clerk SDK off the critical path: it loads
 * after first paint, then ClerkRootProvider inserts the one app-wide
 * <ClerkProvider> and remounts the subtree. Every consumer reads the module
 * via ClerkModuleContext and must tolerate `mod: null` until then — nobody
 * mounts a second provider.
 */
export function loadClerkModule(): Promise<ClerkModule> {
  clerkModulePromise ??= import("@clerk/tanstack-react-start")
    .then(withSignedInOutCompat)
    .catch((err: unknown) => {
      // Clear so a later mount can retry instead of caching the rejection.
      clerkModulePromise = null;
      throw err;
    });
  return clerkModulePromise;
}

/**
 * Shared across every Clerk consumer (AuthButtons via wrapWithProvider={false},
 * SuggestTranslation, the submit/sign-in pages). ClerkRootProvider owns the
 * ONE <ClerkProvider> and publishes the module here once loaded.
 */
export const ClerkModuleContext = createContext<ClerkModuleState>(EMPTY_STATE);

export function useClerkModule(): ClerkModuleState {
  return useContext(ClerkModuleContext);
}

/** Sync env read — lets the root render before the Clerk chunk arrives. */
export function getClerkPublishableKey(): string | undefined {
  const env =
    typeof import.meta !== "undefined"
      ? ((import.meta as unknown as Record<string, unknown>).env as
          | Record<string, string>
          | undefined)
      : undefined;
  return env?.VITE_CLERK_PUBLISHABLE_KEY || env?.CLERK_PUBLISHABLE_KEY;
}
