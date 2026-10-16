import { ErrorBoundary } from "@aidr/ui";
import { useEffect } from "react";
import { useClerkModule } from "../lib/clerk-user";
import { withLang } from "../lib/locale-url";
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
    <ErrorBoundary fallback={<SignInFallback lang={props.lang} />}>
      <SuggestTranslationInner {...props} />
    </ErrorBoundary>
  );
}

/**
 * Signed out with no Clerk SDK on the page. A link to /sign-in, where the
 * route mounts the SDK, instead of the modal `SignInToSuggest` opens: mounting
 * the SDK here would remount the story and drop the pending selection, and
 * the modal's own redirect leaves the page after sign-in anyway. The floating
 * "Suggest" button hands over selected text through `initialText`; that
 * click goes to /sign-in too, so it is never silently dropped. A plain href,
 * like the vote dialog's, so this also renders outside the router.
 */
function SignInFallback({
  lang,
  initialText,
  suggestionAttempt,
}: {
  lang: Lang;
  initialText?: string;
  suggestionAttempt?: number;
}) {
  const href = withLang("/sign-in", lang);

  // `suggestionAttempt` is in the deps so a repeat of the same text is a
  // new click.
  useEffect(() => {
    if (initialText) window.location.assign(href);
  }, [initialText, suggestionAttempt, href]);

  return (
    <a
      href={href}
      className="text-xs text-accent underline underline-offset-2 hover:no-underline"
    >
      {lang === "vi" ? "Đăng nhập để góp ý" : "Sign in to suggest"}
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
