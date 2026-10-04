import { useEffect, useRef } from "react";
import type { Lang } from "../../lib/types";

/** Clerk mounts the sign-in modal on `document.body` and `openSignIn`
 * returns void, so these nodes are the only open/close signal. */
const SIGN_IN_MODAL = ".cl-modalContent, .cl-modalBackdrop";

function signInModalOpen(): boolean {
  return document.querySelector(SIGN_IN_MODAL) !== null;
}

/** Signed-out: clickable control that opens the Clerk sign-in modal.
 * Also opens the modal when the floating selection "Suggest" button
 * hands us selected text (instead of silently dropping it). Keeps the
 * selected text so SuggestForm can pre-fill after sign-in.
 *
 * The text is remembered only while that modal is open. Storing it
 * before `openSignIn` runs makes the same selection a no-op when Clerk
 * throws or the reader dismisses the modal. */
export function SignInToSuggest({
  lang,
  SignInButton,
  useClerk,
  initialText,
  suggestionAttempt = 0,
}: {
  lang: Lang;
  SignInButton: any;
  useClerk: any;
  initialText?: string;
  /** Bumps on every Suggest click, including a repeat of the same text. */
  suggestionAttempt?: number;
  onInitialTextConsumed?: () => void;
}) {
  const clerk = useClerk();
  const promptedFor = useRef<string | null>(null);
  // The click we already handed to `openSignIn`. Distinct from
  // `promptedFor`, which is set only once the modal is actually open.
  const calledAttempt = useRef<number | null>(null);

  useEffect(() => {
    if (!initialText) return;

    const remember = () => {
      promptedFor.current = initialText;
    };
    const forget = () => {
      if (promptedFor.current === initialText) promptedFor.current = null;
    };

    // A dismissed modal must not keep the previous selection. Clear
    // before deciding, so this run can open the same text again.
    if (!signInModalOpen()) forget();

    if (signInModalOpen()) {
      remember();
      calledAttempt.current = suggestionAttempt;
    } else if (
      promptedFor.current !== initialText &&
      calledAttempt.current !== suggestionAttempt
    ) {
      if (!clerk || typeof clerk.openSignIn !== "function") return;
      try {
        clerk.openSignIn({});
      } catch {
        // Clerk unavailable — the button below still opens sign-in,
        // and this selection can try again.
        return;
      }
      calledAttempt.current = suggestionAttempt;
      if (signInModalOpen()) remember();
    }

    const observer = new MutationObserver(() => {
      if (signInModalOpen()) {
        remember();
        return;
      }
      forget();
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => observer.disconnect();
  }, [initialText, suggestionAttempt, clerk]);

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
