import { Button } from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { type ClerkModule, useClerkModule } from "../../lib/clerk-user";
import { useLang } from "../../lib/lang-context";
import { withLang } from "../../lib/locale-url";

/**
 * Always-visible "Sign in": a plain /sign-in link that renders immediately —
 * no waiting on the deferred Clerk SDK or an auth round-trip. Once Clerk is
 * up and reports signed-in, it swaps to the UserButton avatar. This replaces
 * AuthButtons here, which renders nothing until the Clerk module arrives.
 */
export function HeaderAuth({
  avatarSize = "size-7",
  stacked = false,
  onSignIn,
}: {
  avatarSize?: string;
  stacked?: boolean;
  onSignIn?: () => void;
}) {
  const navigationLang = useLang();
  const { mod } = useClerkModule();
  const signIn = (
    <Button
      variant="outline"
      size={stacked ? "lg" : "sm"}
      className={stacked ? "w-full" : undefined}
      asChild
    >
      <Link
        to="/sign-in/$"
        params={{ _splat: "" }}
        search={{ lang: navigationLang }}
        onClick={() => {
          track("nav_click", { to: "/sign-in" });
          onSignIn?.();
        }}
      >
        Sign in
      </Link>
    </Button>
  );
  if (!mod) return signIn;
  return <SignedInAvatar mod={mod} avatarSize={avatarSize} fallback={signIn} />;
}

/** Only mounted once ClerkRootProvider has wrapped the tree, so useAuth is
 *  safe. Until auth resolves to signed-in, keep showing the Sign in link. */
function SignedInAvatar({
  mod,
  avatarSize,
  fallback,
}: {
  mod: ClerkModule;
  avatarSize: string;
  fallback: ReactNode;
}) {
  const navigationLang = useLang();
  const { isLoaded, isSignedIn } = mod.useAuth();
  if (!isLoaded || !isSignedIn) return fallback;
  return (
    <mod.UserButton
      appearance={{ elements: { avatarBox: avatarSize } }}
      signInUrl={withLang("/sign-in", navigationLang)}
    />
  );
}
