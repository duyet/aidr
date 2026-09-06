import * as ClerkTanStack from "@clerk/tanstack-react-start";
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

const clerkModule = withSignedInOutCompat(ClerkTanStack);

/**
 * Shared across every Clerk consumer (AuthButtons via wrapWithProvider={false},
 * SuggestTranslation, the submit page). __root.tsx owns the ONE
 * <ClerkProvider> and publishes the module here — every consumer reads this
 * context and never mounts a second provider.
 */
export const ClerkModuleContext = createContext<ClerkModuleState>(EMPTY_STATE);

export function useClerkModule(): ClerkModuleState {
  return useContext(ClerkModuleContext);
}

/** Sync module + key for __root (SSR-safe static import). */
export function getClerkModuleState(): ClerkModuleState {
  const env =
    typeof import.meta !== "undefined"
      ? ((import.meta as unknown as Record<string, unknown>).env as
          | Record<string, string>
          | undefined)
      : undefined;
  const publishableKey =
    env?.VITE_CLERK_PUBLISHABLE_KEY || env?.CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) return EMPTY_STATE;
  return { mod: clerkModule, publishableKey };
}
