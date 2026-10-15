/**
 * Homepage rows expand from the title: a plain click opens the row in
 * place, while modified clicks keep the permalink so readers can still
 * open it in a new tab. The ↗ link always goes to the original article
 * and never toggles the row.
 *
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordRead } from "../lib/analytics/reads";
import { track } from "../lib/analytics/track";
import type { FeedItem } from "../lib/types";
import { StoryRow } from "./StoryRow";

vi.mock("./SuggestTranslation", () => ({
  SuggestTranslation: () => null,
  SuggestionBadge: () => null,
}));
vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));
vi.mock("../lib/analytics/reads", () => ({ recordRead: vi.fn() }));
vi.mock("../lib/vote-fn", () => ({
  castStoryVote: () => Promise.resolve({ myVote: 0, voteNet: 0, rankScore: 0 }),
  fetchMyVotes: () => Promise.resolve({ votes: {}, nets: {} }),
}));

const item: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://www.example.com/post",
  title: "A story",
  title_vi: null,
  summary: "Summary",
  summary_vi: null,
  category: null,
  published_at: 1_700_000_000,
  points: 0,
  comments: 0,
  rank_score: 0,
  source_id: "hn",
  tags: [],
  sources: [],
  llm_tokens: 0,
  image_url: null,
  content_log: [],
};

const bare: FeedItem = { ...item, summary: null };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {}))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(track).mockClear();
  vi.mocked(recordRead).mockClear();
});

const row = () => document.querySelector('[role="button"]') as HTMLElement;
const title = () => screen.getByText("A story").closest("a") as HTMLElement;
const chevron = () =>
  document.querySelector('[data-testid="story-row-chevron"]');

describe("title click expands the row", () => {
  it("plain click toggles the row instead of navigating", () => {
    render(<StoryRow item={item} index={1} lang="en" />);
    expect(title().getAttribute("href")).toBe("/abcdef12?lang=en");
    // fireEvent returns false when the default (navigation) was prevented.
    expect(fireEvent.click(title())).toBe(false);
    expect(row().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(title());
    expect(row().getAttribute("aria-expanded")).toBe("false");
  });

  it.each(["ctrlKey", "metaKey", "shiftKey"])(
    "%s click keeps the permalink navigation",
    (key) => {
      render(<StoryRow item={item} index={1} lang="en" />);
      expect(fireEvent.click(title(), { [key]: true })).toBe(true);
      expect(row().getAttribute("aria-expanded")).toBe("false");
    }
  );

  it("rows without details navigate on title click", () => {
    render(<StoryRow item={bare} index={1} lang="en" />);
    expect(row()).toBeNull();
    expect(fireEvent.click(title())).toBe(true);
  });
});

describe("expand chevron", () => {
  it("shows only for rows with details and tracks expanded state", () => {
    render(<StoryRow item={item} index={1} lang="en" />);
    expect(chevron()?.getAttribute("data-expanded")).toBe("false");
    fireEvent.click(row());
    expect(chevron()?.getAttribute("data-expanded")).toBe("true");
    expect(chevron()?.getAttribute("class")).toContain("rotate-180");
  });

  it("is absent for rows without details", () => {
    render(<StoryRow item={bare} index={1} lang="en" />);
    expect(chevron()).toBeNull();
  });
});

describe("original article link", () => {
  it("opens item.url in a new tab and never toggles the row", () => {
    render(<StoryRow item={item} index={1} lang="vi" />);
    const link = screen.getByLabelText("Mở bài gốc");
    expect(link.getAttribute("href")).toBe(item.url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    fireEvent.click(link);
    expect(row().getAttribute("aria-expanded")).toBe("false");
  });
});

describe("story_view", () => {
  it("fires once per expand under StrictMode and never on collapse", () => {
    history.replaceState({}, "", "/");
    render(
      <StrictMode>
        <StoryRow item={item} index={1} lang="en" />
      </StrictMode>
    );
    fireEvent.click(row());
    fireEvent.click(row());
    fireEvent.click(row());
    const view = [
      "story_view",
      { item_id: "abcdef12deadbeef", via: "row", page_type: "home" },
    ];
    expect(vi.mocked(track).mock.calls).toEqual([view, view]);
  });

  it("reports the page the row was opened on", () => {
    history.replaceState({}, "", "/date/2026-10-01");
    render(<StoryRow item={item} index={1} lang="en" />);
    fireEvent.click(row());
    expect(track).toHaveBeenCalledExactlyOnceWith("story_view", {
      item_id: "abcdef12deadbeef",
      via: "row",
      page_type: "day",
    });
    history.replaceState({}, "", "/");
  });
});

describe("read beacons", () => {
  it("count an open on expand, never on collapse (defect: closing a row counts as a read)", () => {
    render(<StoryRow item={item} index={1} lang="en" />);
    fireEvent.click(row());
    expect(recordRead).toHaveBeenCalledExactlyOnceWith(item.id, "open");
    fireEvent.click(row());
    expect(recordRead).toHaveBeenCalledTimes(1);
  });

  it("count an open when the story page renders the row open (defect: permalink visits never count)", () => {
    render(<StoryRow item={item} index={1} lang="en" defaultExpanded />);
    expect(recordRead).toHaveBeenCalledExactlyOnceWith(item.id, "open");
  });

  it("count an outbound click on the original link without counting an open", () => {
    render(<StoryRow item={item} index={1} lang="en" />);
    fireEvent.click(screen.getByLabelText("Open original"));
    expect(recordRead).toHaveBeenCalledExactlyOnceWith(item.id, "outbound");
  });
});
