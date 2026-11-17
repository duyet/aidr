/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LangContext } from "../lib/lang-context";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../lib/prefs";
import type { FeedItem, FeedResponse, TldrBullet } from "../lib/types";
import { Route } from "./index";

vi.mock("../components/SuggestTranslation", () => ({
  SuggestTranslation: () => null,
  SuggestionBadge: () => null,
}));
vi.mock("../lib/vote-fn", () => ({
  castStoryVote: () => Promise.resolve({ myVote: 0, voteNet: 0, rankScore: 0 }),
  fetchMyVotes: () => Promise.resolve({ votes: {}, nets: {} }),
}));
vi.mock("../lib/analytics/reads", () => ({ recordRead: vi.fn() }));
vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));
vi.mock("../lib/feed-fn", () => ({ fetchFeed: vi.fn() }));
vi.mock("../lib/feed-cache", () => ({
  setCachedFeed: vi.fn(),
  setFeedMeta: vi.fn(),
}));
// The AI;DR card is its own unit; the page only decides which bullets it gets.
vi.mock("../components/TldrSection", () => ({
  TldrSection: ({
    bullets,
    secondBullets,
  }: {
    bullets: TldrBullet[];
    secondBullets?: TldrBullet[];
  }) => (
    <ul aria-label="digest">
      {bullets.map((b) => (
        <li key={b.text}>{b.text}</li>
      ))}
      {(secondBullets ?? []).map((b) => (
        <li key={b.text} data-second="">
          {b.text}
        </li>
      ))}
    </ul>
  ),
}));

function item(id: string, title: string, category: string): FeedItem {
  return {
    id: id.padEnd(16, "0"),
    url: "https://www.example.com/post",
    title,
    title_vi: null,
    summary: null,
    summary_vi: null,
    category,
    published_at: 1_700_000_000,
    points: 0,
    comments: 0,
    rank_score: 1,
    source_id: "hn",
    tags: [],
    sources: [],
    llm_tokens: 0,
    image_url: null,
  };
}

const items = [
  item("a1", "Lead model story", "Models"),
  item("b1", "Chip supply story", "Chips"),
  item("a2", "Second model story", "Models"),
];

const feed: FeedResponse = {
  tldr: {
    date: "2026-11-15",
    bullets_en: [
      { text: "Digest about models", item_ids: [items[0].id] },
      { text: "Digest about chips", item_ids: [items[1].id] },
      { text: "Digest with no story" },
    ],
    bullets_vi: [],
  },
  days: [
    {
      date: "2026-11-15",
      items,
      categoryCounts: { Models: 2, Chips: 1 },
    },
    {
      date: "2026-11-14",
      items: [item("c1", "Yesterday story", "Models")],
      categoryCounts: { Models: 1 },
    },
  ],
  categories: [
    { name: "Models", count: 2 },
    { name: "Chips", count: 1 },
  ],
  trending: [{ tag: "Nvidia", count: 4 }],
  totalStories: 4,
  updatedAt: 1_780_000_000_000,
  lastFetchedAt: 1_779_999_000,
  hasMore: false,
};

function renderHome(
  prefs: Partial<Prefs> = {},
  search: { q?: string } = {},
  loaded: FeedResponse = feed
) {
  vi.spyOn(Route, "useSearch").mockReturnValue(search as never);
  vi.spyOn(Route, "useLoaderData").mockReturnValue(loaded as never);
  const Page = Route.options.component as () => ReactElement;
  return render(
    <LangContext.Provider value="en">
      <PrefsContext.Provider
        value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}
      >
        <Page />
      </PrefsContext.Provider>
    </LangContext.Provider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {}))
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("home composition", () => {
  it("stacks the day header, topic chips, the AI;DR card, then the lead, list and rail", () => {
    renderHome({ feedDays: 1 });
    const order = [
      screen.getByRole("heading", { level: 2, name: /Nov 15/ }),
      screen.getByRole("navigation", { name: "Topics" }),
      screen.getByRole("list", { name: "digest" }),
      screen.getByRole("heading", { name: "Lead model story" }),
      screen.getByRole("heading", { name: "Ranked today" }),
      screen.getByRole("complementary"),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });

  it("links the day header back to the previous day's page", () => {
    renderHome({ feedDays: 1 });
    expect(
      screen.getByRole("link", { name: "Previous day" }).getAttribute("href")
    ).toBe("/date/2026-11-14?lang=en");
  });

  it("filters the feed and the AI;DR card together when a topic chip is chosen", () => {
    renderHome({ feedDays: 1 });
    expect(screen.getByText("Digest about chips")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Chips 1" }));
    expect(
      screen.getByRole("heading", { name: "Chip supply story" })
    ).toBeTruthy();
    expect(screen.queryByText("Lead model story")).toBeNull();
    expect(screen.queryByText("Second model story")).toBeNull();
    expect(screen.getByText("Digest about chips")).toBeTruthy();
    expect(screen.queryByText("Digest about models")).toBeNull();
    expect(screen.queryByText("Digest with no story")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.getByText("Digest about models")).toBeTruthy();
    expect(screen.getByText("Digest with no story")).toBeTruthy();
  });

  it("hands the card the other language's digest in bilingual mode, filtered the same way", () => {
    const withVi: FeedResponse = {
      ...feed,
      tldr: feed.tldr && {
        ...feed.tldr,
        bullets_vi: [
          { text: "Tóm tắt về model", item_ids: [items[0].id] },
          { text: "Tóm tắt về chip", item_ids: [items[1].id] },
        ],
      },
    };
    renderHome({ feedDays: 1, bilingual: true }, {}, withVi);
    const second = () =>
      [...document.querySelectorAll("[data-second]")].map(
        (li) => li.textContent
      );
    expect(second()).toEqual(["Tóm tắt về model", "Tóm tắt về chip"]);
    fireEvent.click(screen.getByRole("button", { name: "Chips 1" }));
    expect(second()).toEqual(["Tóm tắt về chip"]);
  });

  it("gives the card one language when bilingual is off", () => {
    renderHome({ feedDays: 1, bilingual: false });
    expect(document.querySelectorAll("[data-second]")).toHaveLength(0);
  });

  it("marks a trending tag pressed when it is chosen in the rail", () => {
    renderHome({ feedDays: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Nvidia 4" }));
    expect(
      screen
        .getByRole("button", { name: "Nvidia 4" })
        .getAttribute("aria-pressed")
    ).toBe("true");
  });
});

describe("home sections", () => {
  it("keeps the lead story but drops the ranked list and older days with the list off", () => {
    renderHome({
      feedDays: 1,
      sections: { ...DEFAULT_PREFS.sections, days: false },
    });
    expect(
      screen.getByRole("heading", { name: "Lead model story" })
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Ranked today" })).toBeNull();
    expect(screen.queryByText("Second model story")).toBeNull();
  });

  it("drops the topic chips, the digest and trending with those sections off", () => {
    renderHome({
      feedDays: 1,
      sections: {
        ...DEFAULT_PREFS.sections,
        categories: false,
        tldr: false,
        trending: false,
      },
    });
    expect(screen.queryByRole("navigation", { name: "Topics" })).toBeNull();
    expect(screen.queryByRole("list", { name: "digest" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nvidia 4" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Lead model story" })
    ).toBeTruthy();
  });
});

describe("search results", () => {
  it("lists matches as plain days: no header, chips, digest, lead or rail", () => {
    renderHome({}, { q: "model" });
    expect(screen.getByText(/Results for/)).toBeTruthy();
    expect(screen.getByText("Lead model story")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Topics" })).toBeNull();
    expect(screen.queryByRole("list", { name: "digest" })).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Ranked today" })).toBeNull();
  });

  it("shows the matches even with the ranked list section off", () => {
    renderHome(
      { sections: { ...DEFAULT_PREFS.sections, days: false } },
      { q: "model" }
    );
    expect(screen.getByText("Lead model story")).toBeTruthy();
  });
});
