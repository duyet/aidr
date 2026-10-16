import { ErrorBoundary } from "@aidr/ui";
import { useHydrated } from "@tanstack/react-router";
import { useEffect } from "react";
import { hasClerkSessionCookie, useClerkModule } from "../lib/clerk-user";
import { signInHref } from "../lib/sign-in-href";
import { storyPath } from "../lib/slug";
import type { Lang } from "../lib/types";
import { SignInToSuggest } from "./suggest/SignInToSuggest";
import { SuggestFormGate } from "./suggest/SuggestForm";

export { SuggestionBadge } from "./suggest/SuggestionBadge";

export function SuggestTranslation(props: {
  itemId: string;
  lang: Lang;
  initialText?: string;
  suggestionAttempt?: number;
  onInitialTextConsumed?: () => void;
}) {
  // Any Clerk failure degrades to a sign-in prompt — never the router's
  // full-page error screen.
  return (
    <ErrorBoundary
      fallback={<SignInFallback itemId={props.itemId} lang={props.lang} />}
    >
      <SuggestTranslationInner {...props} />
    </ErrorBoundary>
  );
}

/**
 * No Clerk SDK on the page. A reader with a session cookie only waits for
 * the SDK, so they get plain text; a link would bounce them to /sign-in.
 * This render reads the cookie only after hydration, so the server and the
 * hydrating client render plain text too. Signed out, a
 * link to /sign-in, where the route mounts the SDK: mounting it here would
 * remount the story and drop the pending selection. `redirect_url` is the
 * story permalink, because a feed row or dialog has no URL of its own. A
 * selection "Suggest" click (`initialText`) goes to /sign-in too, so it is
 * never silently dropped. A plain href so this renders outside the router.
 */
function SignInFallback({
  itemId,
  lang,
  initialText,
  suggestionAttempt,
}: {
  itemId: string;
  lang: Lang;
  initialText?: string;
  suggestionAttempt?: number;
}) {
  const hydrated = useHydrated();
  const offerLink = hydrated && !hasClerkSessionCookie(document.cookie);
  const href = signInHref(lang, storyPath({ id: itemId }, lang));
  const label = lang === "vi" ? "Đăng nhập để góp ý" : "Sign in to suggest";

  // `suggestionAttempt` is in the deps so a repeat of the same text is a
  // new click.
  useEffect(() => {
    if (offerLink && initialText) window.location.assign(href);
  }, [offerLink, initialText, suggestionAttempt, href]);

  if (!offerLink) {
    return <span className="text-xs text-muted-foreground">{label}</span>;
  }
  return (
    <a
      href={href}
      className="text-xs text-accent underline underline-offset-2 hover:no-underline"
    >
      {label}
    </a>
  );
}

function SuggestTranslationInner({
  itemId,
  lang,
  initialText,
  suggestionAttempt,
  onInitialTextConsumed,
}: {
  itemId: string;
  lang: Lang;
  initialText?: string;
  suggestionAttempt?: number;
  onInitialTextConsumed?: () => void;
}) {
  const { mod, publishableKey } = useClerkModule();

  if (!publishableKey || !mod) {
    return (
      <SignInFallback
        itemId={itemId}
        lang={lang}
        initialText={initialText}
        suggestionAttempt={suggestionAttempt}
      />
    );
  }

  const { SignedIn, SignedOut, useUser, useAuth, SignInButton, useClerk } = mod;

  // No own <ClerkProvider> here — __root.tsx mounts the single app-wide
  // one; a second provider crashes the whole page.
  return (
    <>
      <SignedOut>
        <SignInToSuggest
          lang={lang}
          SignInButton={SignInButton}
          useClerk={useClerk}
          initialText={initialText}
          suggestionAttempt={suggestionAttempt}
        />
      </SignedOut>
      <SignedIn>
        <SuggestFormGate
          itemId={itemId}
          lang={lang}
          useUser={useUser}
          useAuth={useAuth}
          initialText={initialText}
          onInitialTextConsumed={onInitialTextConsumed}
        />
      </SignedIn>
    </>
  );
}
