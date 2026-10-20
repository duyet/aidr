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
  /** Starts the SDK download and nothing else. It never mounts the provider,
   * so a signed-out control may call it on hover or focus without the page
   * remounting under the pointer. The provider mounts only per
   * `shouldMountClerk`. */
  preloadClerk: () => void;
}

const EMPTY_STATE: ClerkModuleState = {
  mod: null,
  publishableKey: undefined,
  preloadClerk: () => {},
};

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
 * Dynamic import keeps the Clerk SDK off the critical path. ClerkRootProvider
 * inserts the one app-wide <ClerkProvider> once this resolves, which remounts
 * the subtree. Every consumer reads the module via ClerkModuleContext and
 * must tolerate `mod: null` until then; nobody mounts a second provider.
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

/**
 * Client-side twin of the server's `hasAuthSignal` cookie rule
 * (edge-cache.ts): a Clerk session cookie means the visitor may be signed in,
 * so the SDK is worth loading. Clerk writes `__client_uat=0` for signed-out
 * visitors, which must not count.
 */
export function hasClerkSessionCookie(cookie: string): boolean {
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    const name = (eq === -1 ? part : part.slice(0, eq)).trim();
    const value = eq === -1 ? "" : part.slice(eq + 1).trim();
    if (name.startsWith("__session") || name.startsWith("__clerk")) return true;
    if (name.startsWith("__client_uat") && value !== "0" && value !== "") {
      return true;
    }
  }
  return false;
}

const CLERK_ROUTE_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/contribute",
  "/mail",
  "/data",
];

/** Routes that mount Clerk UI for a signed-out visitor (sign-in, sign-up,
 * contribute modal) or gate on useAdmin (mail, data). */
export function routeNeedsClerk(pathname: string): boolean {
  return CLERK_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Whether the app-wide <ClerkProvider> belongs in the tree. Inserting it
 * remounts everything below it, so the answer depends only on page-level
 * facts (where the reader is, whether they have a session) and never on a
 * hover or a tap. Both inputs change only at hydration or at a navigation,
 * which is when a remount costs nothing. Signed-out intent on a reader page
 * preloads the chunk and navigates to /sign-in, where this returns true.
 */
export function shouldMountClerk(pathname: string, cookie: string): boolean {
  return hasClerkSessionCookie(cookie) || routeNeedsClerk(pathname);
}

export function getClerkPublishableKey(): string | undefined {
  const env =
    typeof import.meta !== "undefined"
      ? ((import.meta as unknown as Record<string, unknown>).env as
          | Record<string, string>
          | undefined)
      : undefined;
  return env?.VITE_CLERK_PUBLISHABLE_KEY || env?.CLERK_PUBLISHABLE_KEY;
}

/** RequestInit fragment for authed server-fn calls — empty when there's no
 * token, so callers can spread it unconditionally: `...bearerHeaders(token)`. */
export function bearerHeaders(token: string | null) {
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
}
