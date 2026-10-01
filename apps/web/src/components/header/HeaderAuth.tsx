import { Button } from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { type ClerkModule, useClerkModule } from "../../lib/clerk-user";
import { useLang } from "../../lib/lang-context";
import { withLang } from "../../lib/locale-url";

/**
 * Always-visible sign-in: a plain /sign-in link that renders immediately —
 * no waiting on the deferred Clerk SDK or an auth round-trip. In the header
 * it is an empty avatar in a fixed avatar-sized slot; once Clerk reports
 * signed-in, the real UserButton avatar fills the same slot, so the header
 * never shifts. The stacked (phone menu) variant stays a full-width button.
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
  const onClick = () => {
    track("nav_click", { to: "/sign-in" });
    onSignIn?.();
  };
  const signIn = stacked ? (
    <Button variant="outline" size="lg" className="w-full" asChild>
      <Link
        to="/sign-in/$"
        params={{ _splat: "" }}
        search={{ lang: navigationLang }}
        onClick={onClick}
      >
        Sign in
      </Link>
    </Button>
  ) : (
    <Link
      to="/sign-in/$"
      params={{ _splat: "" }}
      search={{ lang: navigationLang }}
      onClick={onClick}
      aria-label="Sign in"
      title="Sign in"
      className={`${avatarSize} inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50`}
    >
      <UserRound className="size-[60%]" aria-hidden />
    </Link>
  );
  if (!mod) return signIn;
  const avatar = (
    <SignedInAvatar mod={mod} avatarSize={avatarSize} fallback={signIn} />
  );
  // Same box either way, so the swap to the real avatar never moves the row.
  return stacked ? (
    avatar
  ) : (
    <span
      className={`${avatarSize} inline-flex shrink-0 items-center justify-center`}
    >
      {avatar}
    </span>
  );
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
