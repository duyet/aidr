/**
 * A lean feed row loads its story on first expand (#910). A failed read
 * (5xx or offline) must let the next expand try again. A 404 is final:
 * the row keeps its lean content and does not ask again.
 *
 * @vitest-environment happy-dom
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedItem } from "../lib/types";
import { StoryRow } from "./StoryRow";

vi.mock("./SuggestTranslation", () => ({
  SuggestTranslation: () => null,
  SuggestionBadge: () => null,
}));

// The vote server fn imports cloudflare:workers. Happy-dom has no resolver
// for that module; this test does not cast a vote.
vi.mock("../lib/vote-fn", () => ({
  castStoryVote: () => Promise.resolve({ myVote: 0, voteNet: 0, rankScore: 0 }),
  fetchMyVotes: () => Promise.resolve({ votes: {}, nets: {} }),
}));

// A read beacon would go out through happy-dom's real network stack.
vi.mock("../lib/analytics/reads", () => ({ recordRead: vi.fn() }));

const lean: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://www.example.com/post",
  title: "A story",
  title_vi: null,
  summary: null,
  summary_vi: null,
  category: null,
  published_at: 1_700_000_000,
  points: 0,
  comments: 0,
  rank_score: 0,
  source_id: "hn",
  tags: ["models"],
  sources: [],
  llm_tokens: 0,
  image_url: null,
  lazyDetail: true,
};

function stubStoryFetch(status: number) {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify({}), { status })
  );
  vi.stubGlobal("fetch", fetchMock);
  return () =>
    fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/story"))
      .length;
}

async function toggle() {
  const row = document.querySelector('[role="button"]');
  if (!row) throw new Error("missing row header");
  await act(async () => {
    fireEvent.click(row);
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("lazy row detail failure", () => {
  it("asks again on the next expand after a 500 (defect: one D1 blip pins the lean row for the session)", async () => {
    const storyCalls = stubStoryFetch(500);
    render(<StoryRow item={lean} index={1} lang="en" />);

    await toggle();
    expect(storyCalls()).toBe(1);
    await toggle();
    await toggle();
    expect(storyCalls()).toBe(2);
  });

  it("does not ask again after a 404", async () => {
    const storyCalls = stubStoryFetch(404);
    render(<StoryRow item={lean} index={1} lang="en" />);

    await toggle();
    await toggle();
    await toggle();
    expect(storyCalls()).toBe(1);
  });
});
