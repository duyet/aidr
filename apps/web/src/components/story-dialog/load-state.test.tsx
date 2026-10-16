/**
 * The story dialog must tell a missing story apart from a failed read
 * (#910). A 404 means the story is gone. A 500 or a dropped connection
 * means the read failed, and the reader gets a way to try again instead
 * of being told the story does not exist.
 *
 * @vitest-environment happy-dom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFS, PrefsContext } from "../../lib/prefs";
import type { FeedItem, Lang } from "../../lib/types";
import { StoryDialog } from "../StoryDialog";

vi.mock("../SuggestTranslation", () => ({
  SuggestionBadge: () => null,
  SuggestTranslation: () => null,
}));

// The vote server fn imports cloudflare:workers. Happy-dom has no resolver
// for that module; the load states do not cast a vote.
vi.mock("../../lib/vote-fn", () => ({
  castStoryVote: () => Promise.resolve({ myVote: 0, voteNet: 0, rankScore: 0 }),
  fetchMyVotes: () => Promise.resolve({ votes: {}, nets: {} }),
}));

const story: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://example.com/story",
  title: "A story title",
  title_vi: null,
  summary: "Story body.",
  summary_vi: null,
  category: null,
  published_at: 1_700_000_000,
  points: 1,
  comments: 0,
  rank_score: 1,
  source_id: "example",
  tags: [],
  sources: [],
  llm_tokens: 0,
  image_url: null,
};

type Reply = { status: number; body?: unknown } | "network";

function stubFetch(...replies: Reply[]) {
  const fetchMock = vi.fn(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected story fetch");
    if (reply === "network") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openDialog(lang: Lang = "en") {
  await act(async () => {
    render(
      <PrefsContext.Provider
        value={{ prefs: DEFAULT_PREFS, setPrefs: vi.fn() }}
      >
        <StoryDialog idPrefix="abcdef12" lang={lang} onClose={vi.fn()} />
      </PrefsContext.Provider>
    );
  });
}

function retryButton(name = "Try again"): HTMLButtonElement | null {
  return screen.queryByRole("button", { name }) as HTMLButtonElement | null;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("story dialog load states", () => {
  it("says the story is not found on a 404, with nothing to retry", async () => {
    stubFetch({ status: 404, body: { error: "not_found" } });
    await openDialog();

    expect(screen.getByText("Story not found.")).toBeTruthy();
    expect(retryButton()).toBeNull();
  });

  it("offers a retry on a 500 instead of calling the story missing (defect: a D1 blip reads as a deleted story)", async () => {
    stubFetch({ status: 500, body: { error: "query_failed" } });
    await openDialog();

    expect(retryButton()).not.toBeNull();
    expect(screen.queryByText("Story not found.")).toBeNull();
    expect(screen.queryByText("Loading...")).toBeNull();
  });

  it("offers a retry when the request never reaches the server (defect: offline reads as a deleted story)", async () => {
    stubFetch("network");
    await openDialog();

    expect(retryButton()).not.toBeNull();
    expect(screen.queryByText("Story not found.")).toBeNull();
  });

  it("labels the retry in Vietnamese for a Vietnamese reader", async () => {
    stubFetch({ status: 503 });
    await openDialog("vi");

    expect(retryButton("Thử lại")).not.toBeNull();
    expect(screen.queryByText("Không tìm thấy tin.")).toBeNull();
  });

  it("refetches on retry, renders the story, and keeps focus in the dialog (defect: retry button is dead or drops focus to the page)", async () => {
    const fetchMock = stubFetch({ status: 500 }, { status: 200, body: story });
    await openDialog();
    const button = retryButton();
    if (!button) throw new Error("missing retry button");

    button.focus();
    await act(async () => {
      button.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Story body.")).toBeTruthy();
    expect(retryButton()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("renders the story on success", async () => {
    stubFetch({ status: 200, body: story });
    await openDialog();

    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe(
      "A story title"
    );
    expect(screen.getByText("Story body.")).toBeTruthy();
    expect(retryButton()).toBeNull();
    expect(screen.queryByText("Story not found.")).toBeNull();
  });
});
