import { ErrorBoundary } from "@aidr/ui";
import { useClerkModule } from "../lib/clerk-user";
import type { Lang } from "../lib/types";
import { SignInToSuggest } from "./suggest/SignInToSuggest";
import { SuggestFormGate } from "./suggest/SuggestForm";

export { SuggestionBadge } from "./suggest/SuggestionBadge";

export function SuggestTranslation(props: {
  itemId: string;
  field: "title" | "summary";
  lang: Lang;
  initialText?: string;
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

function SignInFallback({ lang }: { lang: Lang }) {
  return (
    <span className="text-xs text-muted-foreground">
      {lang === "vi"
        ? "Đăng nhập để góp ý, chỉnh sửa"
        : "Sign in to suggest edits"}
    </span>
  );
}

function SuggestTranslationInner({
  itemId,
  field,
  lang,
  initialText,
  onInitialTextConsumed,
}: {
  itemId: string;
  field: "title" | "summary";
  lang: Lang;
  initialText?: string;
  onInitialTextConsumed?: () => void;
}) {
  const { mod, publishableKey } = useClerkModule();

  if (!publishableKey || !mod) return <SignInFallback lang={lang} />;

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
        />
      </SignedOut>
      <SignedIn>
        <SuggestFormGate
          itemId={itemId}
          field={field}
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
