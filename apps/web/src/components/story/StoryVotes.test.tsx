/** @vitest-environment happy-dom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";
import { type ClerkModule, ClerkModuleContext } from "../../lib/clerk-user";
import { StoryVotes } from "./StoryVotes";

const vote = vi.hoisted(() => ({
  cast: vi.fn(),
  mine: vi.fn(),
}));

vi.mock("../../lib/vote-fn", () => ({
  castStoryVote: vote.cast,
  fetchMyVotes: vote.mine,
}));

const ITEM = "abcdef12deadbeef";

function setCookie(value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: the vote control reads document.cookie synchronously; the async Cookie Store cannot seed it before render.
  document.cookie = value;
}

// Clerk's signed-in marker, built at runtime: a non-zero `__client_uat`.
const SESSION_COOKIE = ["__client_uat", String(Date.now())].join("=");

function withClerk(ui: ReactNode, mod: ClerkModule | null = null) {
  return (
    <ClerkModuleContext.Provider
      value={{ mod, publishableKey: "pk_test", preloadClerk: () => {} }}
    >
      {ui}
    </ClerkModuleContext.Provider>
  );
}

beforeEach(() => {
  setCookie("__client_uat=0");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Owner feedback: the vote control is one small thumbs-up and a count.
// The labelled pill, the down thumb and inline sign-in text read as noise.
describe("StoryVotes markup", () => {
  it("renders one thumbs-up button and the count, nothing else", () => {
    const html = renderToStaticMarkup(
      <StoryVotes itemId={ITEM} voteNet={4} lang="vi" />
    );
    expect(html).not.toContain("Tin này hữu ích?");
    expect(html).not.toContain("Was this useful?");
    expect(html).not.toContain("lucide-thumbs-down");
    expect(html).not.toContain("rounded-full");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html.match(/lucide-thumbs-up/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Thích tin này"');
    // Count stays for screen readers, but not as visible text.
    expect(html).toContain('<span class="sr-only">Tổng phiếu </span>4');
    // No inline sign-in text or link; the button opens a dialog instead.
    expect(html).not.toContain("<a");
    expect(html).not.toContain("Đăng nhập");
  });

  // A negative net next to a lone up thumb reads as broken; floor it at 0.
  it("never shows a negative count", () => {
    const html = renderToStaticMarkup(
      <StoryVotes itemId={ITEM} voteNet={-2} lang="en" />
    );
    expect(html).toContain("</span>0</span>");
    expect(html).not.toContain(">-2<");
  });
});

describe("StoryVotes signed out", () => {
  it("opens a sign-in dialog and posts no vote", () => {
    const outer = vi.fn();
    render(
      withClerk(
        // biome-ignore lint/a11y/noStaticElementInteractions: stands in for the row header
        <div onClick={outer}>
          <StoryVotes itemId={ITEM} voteNet={4} lang="en" />
        </div>
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Upvote" }));
    const dialog = screen.getByRole("dialog", { name: "Sign in to vote" });
    const link = dialog.querySelector("a");
    // Back to this story after sign-in, not the provider's homepage fallback.
    expect(link?.getAttribute("href")).toBe(
      "/sign-in?lang=en&redirect_url=%2Fabcdef12%3Flang%3Den"
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(vote.cast).not.toHaveBeenCalled();
    // Clicks on the control or inside the portal never reach the row.
    fireEvent.click(link as Element);
    expect(outer).not.toHaveBeenCalled();
  });
});

// Since #861 a reader with a session cookie gets the Clerk SDK only after
// hydration. Until it reports who they are, the thumb must not send a
// signed-in reader to /sign-in, and it must keep its box so nothing shifts.
describe("StoryVotes while a session's Clerk SDK loads", () => {
  function expectPending(outer: ReturnType<typeof vi.fn>) {
    const thumb = screen.getByRole("button", { name: "Loading your vote" });
    expect(thumb.hasAttribute("disabled")).toBe(true);
    expect(thumb.textContent).toContain("4");
    fireEvent.click(thumb);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('a[href^="/sign-in"]')).toBeNull();
    expect(vote.cast).not.toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
  }

  it("shows a disabled thumb, not the sign-in dialog, before the SDK arrives", () => {
    setCookie(SESSION_COOKIE);
    const outer = vi.fn();
    render(
      withClerk(
        // biome-ignore lint/a11y/noStaticElementInteractions: stands in for the row header
        <div onClick={outer}>
          <StoryVotes itemId={ITEM} voteNet={4} lang="en" />
        </div>
      )
    );
    expectPending(outer);
  });

  // Clerk's <Show> renders nothing until it has loaded, which would drop
  // the thumb out of the row between the SDK arriving and Clerk loading.
  it("keeps the disabled thumb while the mounted SDK is still loading", () => {
    setCookie(SESSION_COOKIE);
    const outer = vi.fn();
    render(
      withClerk(
        // biome-ignore lint/a11y/noStaticElementInteractions: stands in for the row header
        <div onClick={outer}>
          <StoryVotes itemId={ITEM} voteNet={4} lang="en" />
        </div>,
        clerk({ isLoaded: false, userId: null })
      )
    );
    expectPending(outer);
  });

  it("labels the pending thumb in Vietnamese", () => {
    setCookie(SESSION_COOKIE);
    render(withClerk(<StoryVotes itemId={ITEM} voteNet={4} lang="vi" />));
    expect(
      screen.getByRole("button", { name: "Đang tải phiếu bầu của bạn" })
    ).toBeTruthy();
  });

  // The server cannot read the reader's cookie, so it renders the signed-out
  // thumb. The client's hydrating render must match it, then switch.
  it("hydrates the server markup without a mismatch, then shows the pending thumb", async () => {
    const ui = withClerk(<StoryVotes itemId={ITEM} voteNet={4} lang="en" />);
    const container = document.createElement("div");
    container.innerHTML = renderToString(ui);
    document.body.appendChild(container);
    expect(container.querySelector('[aria-label="Upvote"]')).not.toBeNull();

    setCookie(SESSION_COOKIE);
    const onRecoverableError = vi.fn();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    onTestFinished(() => {
      errors.mockRestore();
      act(() => root?.unmount());
      container.remove();
    });
    await act(async () => {
      root = hydrateRoot(container, ui, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(
      container.querySelector('[aria-label="Loading your vote"]')
    ).not.toBeNull();
  });
});

// Once Clerk has loaded and found no user (a stale cookie, or a signed-out
// reader on a Clerk route), the thumb is the signed-out one again. It must
// not read or cast votes without a session.
describe("StoryVotes with Clerk loaded and no user", () => {
  it("opens the sign-in dialog and never fetches or casts a vote", () => {
    render(
      withClerk(
        <StoryVotes itemId={ITEM} voteNet={4} lang="en" />,
        clerk({ isLoaded: true, userId: null })
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Upvote" }));
    const dialog = screen.getByRole("dialog", { name: "Sign in to vote" });
    expect(dialog.querySelector("a")?.getAttribute("href")).toBe(
      "/sign-in?lang=en&redirect_url=%2Fabcdef12%3Flang%3Den"
    );
    expect(vote.mine).not.toHaveBeenCalled();
    expect(vote.cast).not.toHaveBeenCalled();
  });
});

function clerk(auth: { isLoaded: boolean; userId: string | null }) {
  return {
    useAuth: () => ({ ...auth, getToken: () => Promise.resolve("token") }),
  } as unknown as ClerkModule;
}

function signedInClerk(): ClerkModule {
  return clerk({ isLoaded: true, userId: "user_1" });
}

describe("StoryVotes signed in", () => {
  it("sends +1, and a second click clears the vote with +1 again", async () => {
    vote.mine.mockResolvedValue({ votes: {}, nets: { [ITEM]: 4 } });
    vote.cast
      .mockResolvedValueOnce({ myVote: 1, voteNet: 5, rankScore: 0 })
      .mockResolvedValueOnce({ myVote: 0, voteNet: 4, rankScore: 0 });
    const outer = vi.fn();
    render(
      <ClerkModuleContext.Provider
        value={{
          mod: signedInClerk(),
          publishableKey: "pk_test",
          preloadClerk: () => {},
        }}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: stands in for the row header */}
        <div onClick={outer}>
          <StoryVotes itemId={ITEM} voteNet={4} lang="en" />
        </div>
      </ClerkModuleContext.Provider>
    );
    const up = await screen.findByRole("button", { name: "Upvote" });
    await waitFor(() => expect(up.hasAttribute("disabled")).toBe(false));
    expect(up.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      fireEvent.click(up);
    });
    const pressed = await screen.findByRole("button", {
      name: "Remove upvote",
    });
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
    expect(pressed.textContent).toContain("5");

    await act(async () => {
      fireEvent.click(pressed);
    });
    const cleared = await screen.findByRole("button", { name: "Upvote" });
    expect(cleared.textContent).toContain("4");

    expect(vote.cast).toHaveBeenCalledTimes(2);
    for (const [arg] of vote.cast.mock.calls) {
      expect(arg.data).toEqual({ item_id: ITEM, value: 1 });
    }
    expect(outer).not.toHaveBeenCalled();
  });
});
