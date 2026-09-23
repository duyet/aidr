import { useEffect, useRef } from "react";
import type { Lang } from "../../lib/types";

/** Signed-out: clickable control that opens the Clerk sign-in modal.
 * Also opens the modal when the floating selection "Suggest" button
 * hands us selected text (instead of silently dropping it). Keeps the
 * selected text so SuggestForm can pre-fill after sign-in. */
export function SignInToSuggest({
  lang,
  SignInButton,
  useClerk,
  initialText,
}: {
  lang: Lang;
  SignInButton: any;
  useClerk: any;
  initialText?: string;
  onInitialTextConsumed?: () => void;
}) {
  const clerk = useClerk();
  const promptedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!initialText || promptedFor.current === initialText) return;
    promptedFor.current = initialText;
    try {
      clerk?.openSignIn?.({});
    } catch {
      // Clerk unavailable — button below still works when clicked.
    }
  }, [initialText, clerk]);

  const label = lang === "vi" ? "Đăng nhập để góp ý" : "Sign in to suggest";

  if (!SignInButton) {
    return (
      <button
        type="button"
        onClick={() => {
          try {
            clerk?.openSignIn?.({});
          } catch {
            // ignore
          }
        }}
        className="text-xs text-accent underline underline-offset-2 hover:no-underline"
      >
        {label}
      </button>
    );
  }

  return (
    <SignInButton mode="modal">
      <button
        type="button"
        className="text-xs text-accent underline underline-offset-2 hover:no-underline"
      >
        {label}
      </button>
    </SignInButton>
  );
}
