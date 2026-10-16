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
  /** Signed-out fallbacks call this on hover/focus/click so the SDK starts
   * downloading before the reader reaches the Clerk UI that replaces them. */
  requestClerk: () => void;
}

const EMPTY_STATE: ClerkModuleState = {
  mod: null,
  publishableKey: undefined,
  requestClerk: () => {},
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

/** RequestInit fragment for authed server-fn calls — empty when there's no
 * token, so callers can spread it unconditionally: `...bearerHeaders(token)`. */
export function bearerHeaders(token: string | null) {
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
}
