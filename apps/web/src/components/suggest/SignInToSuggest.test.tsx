/**
 * A signed-out selection must open Clerk's sign-in modal, and the same
 * selection must be able to open it again after the reader closes it.
 * Remembering the text before `openSignIn` returns makes that selection
 * a no-op — including when Clerk throws because the UI is not ready.
 *
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInToSuggest } from "./SignInToSuggest";

function showSignInModal(): HTMLDivElement {
  const modal = document.createElement("div");
  modal.className = "cl-modalContent";
  modal.setAttribute("role", "dialog");
  document.body.appendChild(modal);
  return modal;
}

function removeSignInModals() {
  for (const node of document.querySelectorAll(
    ".cl-modalContent, .cl-modalBackdrop"
  )) {
    node.remove();
  }
}

afterEach(() => {
  cleanup();
  removeSignInModals();
});

function renderControl({
  clerk,
  initialText,
  suggestionAttempt = 1,
  SignInButton,
}: {
  clerk: { openSignIn?: (props: object) => void };
  initialText?: string;
  suggestionAttempt?: number;
  SignInButton?: (props: { mode?: string; children?: ReactNode }) => ReactNode;
}) {
  return render(
    <SignInToSuggest
      lang="en"
      SignInButton={SignInButton}
      useClerk={() => clerk}
      initialText={initialText}
      suggestionAttempt={suggestionAttempt}
    />
  );
}

describe("SignInToSuggest", () => {
  it("does not consume a selection when openSignIn throws", () => {
    const notReady = vi.fn(() => {
      throw new Error("Clerk UI is not mounted");
    });
    let clerk: { openSignIn: (props: object) => void } = {
      openSignIn: notReady,
    };
    const view = renderControl({ clerk, initialText: "cùng một câu" });
    expect(notReady).toHaveBeenCalledTimes(1);

    const ready = vi.fn(() => {
      showSignInModal();
    });
    // A loaded Clerk instance is a new object. The same selection must
    // still open once that object can mount the modal.
    clerk = { openSignIn: ready };
    view.rerender(
      <SignInToSuggest
        lang="en"
        SignInButton={undefined}
        useClerk={() => clerk}
        initialText="cùng một câu"
        suggestionAttempt={1}
      />
    );

    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("opens the same selection again after the modal closes", () => {
    const openSignIn = vi.fn(() => {
      showSignInModal();
    });
    const clerk = { openSignIn };
    const view = renderControl({
      clerk,
      initialText: "cùng một câu",
      suggestionAttempt: 1,
    });
    expect(openSignIn).toHaveBeenCalledTimes(1);

    const again = vi.fn(() => {
      showSignInModal();
    });
    clerk.openSignIn = again;
    view.rerender(
      <SignInToSuggest
        lang="en"
        SignInButton={undefined}
        useClerk={() => clerk}
        initialText="cùng một câu"
        suggestionAttempt={1}
      />
    );
    expect(again).not.toHaveBeenCalled();

    removeSignInModals();
    view.rerender(
      <SignInToSuggest
        lang="en"
        SignInButton={undefined}
        useClerk={() => clerk}
        initialText="cùng một câu"
        suggestionAttempt={2}
      />
    );
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("does not open a second modal while the first one is still up", () => {
    const openSignIn = vi.fn(() => {
      showSignInModal();
    });
    const clerk = { openSignIn };
    const view = renderControl({
      clerk,
      initialText: "cùng một câu",
      suggestionAttempt: 1,
    });

    const again = vi.fn(() => {
      showSignInModal();
    });
    clerk.openSignIn = again;
    view.rerender(
      <SignInToSuggest
        lang="en"
        SignInButton={undefined}
        useClerk={() => clerk}
        initialText="cùng một câu"
        suggestionAttempt={1}
      />
    );

    expect(openSignIn).toHaveBeenCalledTimes(1);
    expect(again).not.toHaveBeenCalled();
  });

  it("keeps the static sign-in control working without SignInButton", () => {
    const openSignIn = vi.fn(() => {
      throw new Error("not ready");
    });
    const clerk = { openSignIn };
    renderControl({ clerk, initialText: "cùng một câu" });

    openSignIn.mockImplementation(() => {
      showSignInModal();
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in to suggest" }));

    expect(openSignIn).toHaveBeenCalledTimes(2);
    expect(document.querySelector(".cl-modalContent")).not.toBeNull();
  });

  it("keeps the Clerk SignInButton wrapper working", () => {
    const openSignIn = vi.fn(() => {
      showSignInModal();
    });
    function SignInButton({
      mode,
      children,
    }: {
      mode?: string;
      children?: ReactNode;
    }) {
      return (
        <div data-testid="clerk-sign-in" data-mode={mode}>
          {children}
        </div>
      );
    }

    renderControl({
      clerk: { openSignIn },
      SignInButton,
    });

    const wrapper = screen.getByTestId("clerk-sign-in");
    expect(wrapper.getAttribute("data-mode")).toBe("modal");
    expect(
      screen.getByRole("button", { name: "Sign in to suggest" })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to suggest" }));
    expect(openSignIn).not.toHaveBeenCalled();
  });

  it("uses the Vietnamese label", () => {
    render(
      <SignInToSuggest
        lang="vi"
        SignInButton={undefined}
        useClerk={() => ({ openSignIn: vi.fn() })}
      />
    );
    expect(
      screen.getByRole("button", { name: "Đăng nhập để góp ý" })
    ).toBeTruthy();
  });
});
