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
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      // biome-ignore lint/a11y/noStaticElementInteractions: stands in for the row header
      <div onClick={outer}>
        <StoryVotes itemId={ITEM} voteNet={4} lang="en" />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Upvote" }));
    const dialog = screen.getByRole("dialog", { name: "Sign in to vote" });
    const link = dialog.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/sign-in?lang=en");
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(vote.cast).not.toHaveBeenCalled();
    // Clicks on the control or inside the portal never reach the row.
    fireEvent.click(link as Element);
    expect(outer).not.toHaveBeenCalled();
  });
});

function signedInClerk(): ClerkModule {
  return {
    SignedIn: ({ children }: { children?: ReactNode }) => children,
    SignedOut: () => null,
    useAuth: () => ({ getToken: () => Promise.resolve("token") }),
  } as unknown as ClerkModule;
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
        value={{ mod: signedInClerk(), publishableKey: "pk_test" }}
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
