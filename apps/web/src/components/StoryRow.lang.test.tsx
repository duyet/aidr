/**
 * An expanded home-feed row drops its loaded story when the reader
 * switches language. It must ask for that language, and a response for
 * a language they already left must not fill the row.
 *
 * @vitest-environment happy-dom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { storyPath } from "../lib/slug";
import type { FeedItem, Lang } from "../lib/types";
import { StoryRow } from "./StoryRow";

// StoryDetail's suggestion UI imports a server function, and happy-dom
// tries to bundle that module's `cloudflare:workers` import. The row
// language bug does not go through suggestions.
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

const lean: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://www.example.com/post",
  title: "A story",
  title_vi: "Một tin",
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

function story(summary: string, summaryVi: string): FeedItem {
  return { ...lean, summary, summary_vi: summaryVi, lazyDetail: undefined };
}

type Pending = {
  url: string;
  fulfill: (body: FeedItem) => void;
};

const pending: Pending[] = [];

function storyUrls(): string[] {
  return pending
    .map((call) => call.url)
    .filter((url) => url.startsWith("/api/story") && !url.includes("ranking="));
}

afterEach(() => {
  pending.length = 0;
  vi.unstubAllGlobals();
  cleanup();
});

function installFetch() {
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return new Promise<Response>((resolve) => {
      pending.push({
        url,
        fulfill: (body) => {
          resolve(
            new Response(JSON.stringify(body), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          );
        },
      });
    });
  });
}

async function settle(call: Pending, body: FeedItem) {
  await act(async () => {
    call.fulfill(body);
  });
}

function header(): HTMLElement {
  const row = document.querySelector('[role="button"]');
  if (!row) throw new Error("missing row header");
  return row as HTMLElement;
}

function renderRow(lang: Lang, item: FeedItem = lean) {
  return render(<StoryRow item={item} index={1} lang={lang} />);
}

describe("expanded row language switch", () => {
  it("refetches an open lazy row in the language the reader just picked", async () => {
    installFetch();
    const view = renderRow("en");
    fireEvent.click(header());

    // Opening asks once. A collapsed row must not have asked on mount.
    expect(storyUrls()).toEqual([`/api/story${storyPath(lean, "en")}`]);
    await settle(pending[0], story("English body", "Thân cũ"));
    expect(screen.getByText("English body")).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();

    view.rerender(<StoryRow item={lean} index={1} lang="vi" />);

    // The open row cleared its English payload, so it is back on Loading
    // until the Vietnamese story arrives. A missing refetch is the bug.
    expect(screen.getByText("Đang tải…")).toBeTruthy();
    expect(screen.queryByText("English body")).toBeNull();
    expect(storyUrls()).toEqual([
      `/api/story${storyPath(lean, "en")}`,
      `/api/story${storyPath(lean, "vi")}`,
    ]);

    await settle(pending[1], story("English body", "Thân tiếng Việt"));
    expect(screen.getByText("Thân tiếng Việt")).toBeTruthy();
    expect(screen.queryByText("Đang tải…")).toBeNull();
  });

  it("drops a story response after the reader has switched language again", async () => {
    installFetch();
    const view = renderRow("en");
    fireEvent.click(header());
    await settle(pending[0], story("English body", "Thân cũ"));

    view.rerender(<StoryRow item={lean} index={1} lang="vi" />);
    const vietnamese = pending[1];
    expect(vietnamese?.url).toBe(`/api/story${storyPath(lean, "vi")}`);

    view.rerender(<StoryRow item={lean} index={1} lang="en" />);
    const englishAgain = pending[2];
    expect(englishAgain?.url).toBe(`/api/story${storyPath(lean, "en")}`);

    // The Vietnamese response is late. It must not replace the row the
    // reader has already pointed back at English.
    await settle(englishAgain, story("English again", "Thân mới"));
    await settle(vietnamese, story("Stale Vietnamese body", "Thân trễ"));

    expect(screen.getByText("English again")).toBeTruthy();
    expect(screen.queryByText("Stale Vietnamese body")).toBeNull();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("does not fetch when a collapsed lazy row changes language", () => {
    installFetch();
    const view = renderRow("en");
    expect(storyUrls()).toEqual([]);

    view.rerender(<StoryRow item={lean} index={1} lang="vi" />);
    expect(storyUrls()).toEqual([]);
    expect(screen.queryByText("Đang tải…")).toBeNull();
  });

  it("does not refetch a permalink row that already has its story", () => {
    installFetch();
    const full = story("Permalink body", "Thân trang tin");
    const view = render(
      <StoryRow item={full} index={1} lang="en" defaultExpanded />
    );
    expect(storyUrls()).toEqual([]);
    expect(screen.getByText("Permalink body")).toBeTruthy();

    view.rerender(<StoryRow item={full} index={1} lang="vi" defaultExpanded />);
    expect(storyUrls()).toEqual([]);
    expect(screen.getByText("Thân trang tin")).toBeTruthy();
  });
});
