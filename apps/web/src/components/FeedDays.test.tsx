/** @vitest-environment happy-dom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangContext } from "../lib/lang-context";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../lib/prefs";
import type { DayGroup, FeedItem, FeedResponse } from "../lib/types";
import { FeedDays, filterDays } from "./FeedDays";

vi.mock("./SuggestTranslation", () => ({
  SuggestTranslation: () => null,
  SuggestionBadge: () => null,
}));
vi.mock("../lib/vote-fn", () => ({
  castStoryVote: () => Promise.resolve({ myVote: 0, voteNet: 0, rankScore: 0 }),
  fetchMyVotes: () => Promise.resolve({ votes: {}, nets: {} }),
}));
vi.mock("../lib/analytics/reads", () => ({ recordRead: vi.fn() }));
vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));

function story(id: string, title: string, category = "Models"): FeedItem {
  return {
    id: `${id.padEnd(16, "0")}`,
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

function day(date: string, titles: string[], category = "Models"): DayGroup {
  const items = titles.map((t, i) =>
    story(`${date.replace(/-/g, "")}${i}`, t, category)
  );
  return { date, items, categoryCounts: { [category]: items.length } };
}

function feedOf(days: DayGroup[], hasMore: boolean): FeedResponse {
  return {
    tldr: null,
    days,
    categories: [],
    trending: [],
    totalStories: days.reduce((n, d) => n + d.items.length, 0),
    updatedAt: 1_780_000_000_000,
    lastFetchedAt: null,
    hasMore,
  };
}

const today = day("2026-11-15", ["Lead story", "Second story", "Third story"]);
const older = day("2026-11-14", ["Older story"]);

class FakeObserver {
  static instances: FakeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(public callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
}

afterEach(() => {
  cleanup();
  FakeObserver.instances = [];
  vi.unstubAllGlobals();
});

function Harness({
  initial,
  prefs = {},
  q,
  selected = [],
  showList = true,
}: {
  initial: FeedResponse;
  prefs?: Partial<Prefs>;
  q?: string;
  selected?: string[];
  showList?: boolean;
}) {
  const [feed, setFeed] = useState(initial);
  return (
    <LangContext.Provider value="en">
      <PrefsContext.Provider
        value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}
      >
        <FeedDays
          feed={feed}
          lang="en"
          selectedTag={null}
          q={q}
          selectedCategories={new Set(selected)}
          showList={showList}
          onMergeOlder={(more) =>
            setFeed((prev) => ({
              ...prev,
              days: [...prev.days, ...more.days],
              hasMore: more.hasMore,
            }))
          }
          onLoadDay={(full) =>
            setFeed((prev) => ({
              ...prev,
              days: prev.days.map((d) => (d.date === full.date ? full : d)),
            }))
          }
        />
      </PrefsContext.Provider>
    </LangContext.Provider>
  );
}

function stubFeedFetch(response: () => Promise<Response>) {
  const fetchMock = vi.fn((_url: string) => response());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const json = (body: FeedResponse) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe("filterDays", () => {
  const mixed: DayGroup = {
    date: "2026-11-15",
    items: [story("a", "A", "Models"), story("b", "B", "Chips")],
    categoryCounts: { Models: 1, Chips: 1 },
    totalItems: 40,
  };

  it("keeps the days with a story in a chosen topic, counting what they show", () => {
    const [kept, ...rest] = filterDays(
      [mixed, day("2026-11-14", ["C"], "Research")],
      new Set(["Chips"])
    );
    expect(rest).toEqual([]);
    expect(kept.items.map((i) => i.title)).toEqual(["B"]);
    expect(kept.categoryCounts).toEqual({ Chips: 1 });
    expect(kept.totalItems).toBeUndefined();
  });

  it("returns the days untouched with no topic chosen", () => {
    const days = [mixed];
    expect(filterDays(days, new Set())).toBe(days);
  });
});

describe("lead story and ranked list", () => {
  it("leads with the day's first story and ranks the list from 2", () => {
    render(
      <Harness initial={feedOf([today], false)} prefs={{ feedDays: 1 }} />
    );
    expect(screen.getByRole("heading", { name: "Lead story" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ranked today" })).toBeTruthy();
    const ranks = [...document.querySelectorAll(".story-rank")].map((r) =>
      r.textContent?.trim()
    );
    expect(ranks).toEqual(["2", "3"]);
    expect(
      document.querySelectorAll(`#item-${today.items[0].id}`)
    ).toHaveLength(0);
  });

  it("filters the lead and the list to the chosen topics", () => {
    const mixed: DayGroup = {
      ...today,
      items: [
        story("m", "Models lead", "Models"),
        story("c", "Chips lead", "Chips"),
        story("c2", "Chips second", "Chips"),
      ],
    };
    render(
      <Harness
        initial={feedOf([mixed], false)}
        prefs={{ feedDays: 1 }}
        selected={["Chips"]}
      />
    );
    expect(screen.getByRole("heading", { name: "Chips lead" })).toBeTruthy();
    expect(screen.queryByText("Models lead")).toBeNull();
    expect(screen.getByText("Chips second")).toBeTruthy();
  });

  it("hides the ranked list and older days with the section off, but keeps the lead", () => {
    const fetchMock = stubFeedFetch(() => json(feedOf([older], false)));
    render(
      <Harness
        initial={feedOf([today], true)}
        showList={false}
        prefs={{ feedDays: 3 }}
      />
    );
    expect(screen.getByRole("heading", { name: "Lead story" })).toBeTruthy();
    expect(screen.queryByText("Second story")).toBeNull();
    expect(screen.queryByRole("button", { name: /Older days/ })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives a search no lead story", () => {
    render(<Harness initial={feedOf([today], false)} q="story" />);
    expect(screen.queryByRole("heading", { name: "Lead story" })).toBeNull();
    expect(screen.getByText("Lead story")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Ranked today" })).toBeNull();
  });

  it("says so when a topic filter leaves nothing", () => {
    render(<Harness initial={feedOf([today], false)} selected={["Chips"]} />);
    expect(
      screen.getByText("No stories match the selected filters.")
    ).toBeTruthy();
  });
});

describe("summaries on a lean payload", () => {
  const lean = (d: DayGroup): DayGroup => ({
    ...d,
    items: d.items.map((i) => ({ ...i, lazyDetail: true })),
  });
  const full: DayGroup = {
    ...today,
    items: today.items.map((i) => ({ ...i, summary: `About ${i.title}` })),
  };
  const leanFeed = () => feedOf([lean(today)], false);

  it("fetches the first day in full once and shows the summaries when they are on", async () => {
    const fetchMock = stubFeedFetch(() => json(feedOf([full], false)));
    render(
      <Harness initial={leanFeed()} prefs={{ feedDays: 1, summaries: true }} />
    );
    await waitFor(() =>
      expect(screen.getByText("About Second story")).toBeTruthy()
    );
    expect(screen.getByText("About Lead story")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0], "http://x");
    expect(url.searchParams.get("days")).toBe("1");
    expect(url.searchParams.get("before")).toBe("2026-11-16");
  });

  it("fetches for the newspaper layout, which always shows them", async () => {
    const fetchMock = stubFeedFetch(() => json(feedOf([full], false)));
    render(
      <Harness
        initial={leanFeed()}
        prefs={{ feedDays: 1, summaries: false, layout: "newspaper" }}
      />
    );
    await waitFor(() =>
      expect(screen.getByText("About Second story")).toBeTruthy()
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing with summaries off, so the default page stays light", () => {
    const fetchMock = stubFeedFetch(() => json(feedOf([full], false)));
    render(<Harness initial={leanFeed()} prefs={{ feedDays: 1 }} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches nothing for a search, whose rows are not the whole day", () => {
    const fetchMock = stubFeedFetch(() => json(feedOf([full], false)));
    render(
      <Harness
        initial={leanFeed()}
        q="story"
        prefs={{ feedDays: 1, summaries: true }}
      />
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not ask again for the same day after a failed fetch", async () => {
    const fetchMock = stubFeedFetch(() =>
      Promise.resolve(new Response("", { status: 500 }))
    );
    const on = { feedDays: 1, summaries: true } as const;
    const view = render(<Harness initial={leanFeed()} prefs={on} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    view.rerender(
      <Harness initial={leanFeed()} prefs={{ ...on, summaries: false }} />
    );
    view.rerender(<Harness initial={leanFeed()} prefs={on} />);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("a filter that empties the newest day", () => {
  it("keeps older days under their own dates, with no lead and no 'Ranked today'", () => {
    const chips = day("2026-11-14", ["Older chip story"], "Chips");
    render(
      <Harness
        initial={feedOf([today, chips], false)}
        prefs={{ feedDays: 3 }}
        selected={["Chips"]}
      />
    );
    expect(screen.queryByRole("heading", { name: "Ranked today" })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Older chip story" })
    ).toBeNull();
    expect(screen.getByText("Older chip story")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Nov 14/ })).toBeTruthy();
  });
});

describe("days shown", () => {
  it("fetches the days the pref asks for beyond the one the page arrived with", async () => {
    const fetchMock = stubFeedFetch(() => json(feedOf([older], false)));
    render(<Harness initial={feedOf([today], true)} prefs={{ feedDays: 3 }} />);
    await waitFor(() => expect(screen.getByText("Older story")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/api/feed");
    expect(url.searchParams.get("days")).toBe("2");
    expect(url.searchParams.get("before")).toBe("2026-11-15");
  });

  it("fetches nothing when the pref is one day", () => {
    const fetchMock = stubFeedFetch(() => json(feedOf([older], false)));
    render(<Harness initial={feedOf([today], true)} prefs={{ feedDays: 1 }} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Older days/ })).toBeTruthy();
  });

  it("loads five more days when Older days is pressed, with a loading row while it waits", async () => {
    let finish: (res: Response) => void = () => {};
    const fetchMock = stubFeedFetch(
      () => new Promise<Response>((resolve) => (finish = resolve))
    );
    render(<Harness initial={feedOf([today], true)} prefs={{ feedDays: 1 }} />);
    fireEvent.click(screen.getByRole("button", { name: /Older days/ }));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(
      new URL(fetchMock.mock.calls[0][0], "http://x").searchParams.get("days")
    ).toBe("5");
    await act(async () => {
      finish(
        new Response(JSON.stringify(feedOf([older], false)), { status: 200 })
      );
    });
    await waitFor(() => expect(screen.getByText("Older story")).toBeTruthy());
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: /Older days/ })).toBeNull();
  });

  it("stops after a failed load and offers a retry", async () => {
    const fetchMock = stubFeedFetch(() =>
      Promise.resolve(new Response("", { status: 500 }))
    );
    render(<Harness initial={feedOf([today], true)} prefs={{ feedDays: 3 }} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockImplementation(() => json(feedOf([older], false)));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Older story")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("infinite days", () => {
  it("watches nothing when the pref is off", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    stubFeedFetch(() => json(feedOf([older], false)));
    render(
      <Harness
        initial={feedOf([today], true)}
        prefs={{ feedDays: 1, infiniteDays: false }}
      />
    );
    expect(FakeObserver.instances).toHaveLength(0);
  });

  it("loads older days when the end of the feed comes into view, once", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    let finish: (res: Response) => void = () => {};
    const fetchMock = stubFeedFetch(
      () => new Promise<Response>((resolve) => (finish = resolve))
    );
    render(
      <Harness
        initial={feedOf([today], true)}
        prefs={{ feedDays: 1, infiniteDays: true }}
      />
    );
    const observer = FakeObserver.instances[0];
    expect(observer.observed).toHaveLength(1);
    act(() => observer.fire());
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    act(() => observer.fire());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(
        new Response(JSON.stringify(feedOf([older], false)), { status: 200 })
      );
    });
    await waitFor(() => expect(screen.getByText("Older story")).toBeTruthy());
    expect(
      FakeObserver.instances.every(
        (o) => o.disconnected || o.observed.length === 0
      )
    ).toBe(true);
  });

  it("keeps the button for keyboard readers", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    render(
      <Harness
        initial={feedOf([today], true)}
        prefs={{ feedDays: 1, infiniteDays: true }}
      />
    );
    expect(screen.getByRole("button", { name: /Older days/ })).toBeTruthy();
  });

  it("stops watching after a failed load", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    stubFeedFetch(() => Promise.resolve(new Response("", { status: 500 })));
    render(
      <Harness
        initial={feedOf([today], true)}
        prefs={{ feedDays: 1, infiniteDays: true }}
      />
    );
    act(() => FakeObserver.instances[0].fire());
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const live = FakeObserver.instances.filter((o) => !o.disconnected);
    expect(live).toHaveLength(0);
  });
});
