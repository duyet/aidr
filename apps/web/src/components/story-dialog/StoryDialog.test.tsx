/** @vitest-environment happy-dom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../../lib/prefs";
import type { FeedItem, FeedResponse } from "../../lib/types";
import { StoryDialog } from "../StoryDialog";

vi.mock("../SuggestTranslation", () => ({
  SuggestionBadge: () => null,
  SuggestTranslation: () => null,
}));

// The vote server fn imports cloudflare:workers. Happy-dom has no resolver
// for that module; the dialog does not cast a vote.
vi.mock("../../lib/vote-fn", () => ({
  castStoryVote: () => Promise.resolve({ myVote: 0, voteNet: 0, rankScore: 0 }),
  fetchMyVotes: () => Promise.resolve({ votes: {}, nets: {} }),
}));

const feedCache = vi.hoisted(() => ({
  cached: null as unknown,
}));
vi.mock("../../lib/feed-cache", () => ({
  getCachedFeed: () => feedCache.cached,
  fetchFeedOnce: () => Promise.resolve(feedCache.cached),
}));

function story(id: string, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Title ${id}`,
    title_vi: null,
    summary: `Summary ${id}.`,
    summary_vi: null,
    category: "Models",
    published_at: 1_700_000_000,
    points: 1,
    comments: 0,
    rank_score: 8.4,
    source_id: "example",
    tags: [],
    sources: [],
    llm_tokens: 0,
    image_url: null,
    ...overrides,
  };
}

const MEDIA = {
  assets: [{ type: "image", url: "https://example.com/hero.jpg" }],
} as FeedItem["media_manifest"];

let items: Record<string, FeedItem>;
const fetched: string[] = [];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const id = decodeURIComponent(
        url.split("/api/story/")[1]?.split("?")[0] ?? ""
      );
      fetched.push(id);
      const found = items[id];
      return new Response(JSON.stringify(found ?? {}), {
        status: found ? 200 : 404,
      });
    })
  );
}

function stubSide(wide: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: wide && query.includes("min-width: 700px"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  );
}

async function open(prefs: Partial<Prefs> = {}, idPrefix = "aaaa1111") {
  const onClose = vi.fn();
  await act(async () => {
    render(
      <PrefsContext.Provider
        value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: vi.fn() }}
      >
        <StoryDialog idPrefix={idPrefix} lang="en" onClose={onClose} />
      </PrefsContext.Provider>
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return onClose;
}

function press(key: string, init: KeyboardEventInit = {}) {
  return act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      })
    );
  });
}

const panel = () => screen.getByRole("dialog", { name: /Title/ });

beforeEach(() => {
  fetched.length = 0;
  feedCache.cached = null;
  items = {
    aaaa1111: story("aaaa1111"),
    bbbb2222: story("bbbb2222"),
    cccc3333: story("cccc3333"),
  };
  stubFetch();
  stubSide(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("story dialog panel", () => {
  it("is a side panel from 700px and a bottom sheet under it", async () => {
    await open();
    expect(panel().getAttribute("data-side")).toBe("right");
    cleanup();
    stubSide(false);
    await open();
    expect(panel().getAttribute("data-side")).toBe("bottom");
  });

  it("names the dialog by the story title and keeps the page inert behind it", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    await open();
    expect(panel().getAttribute("aria-modal")).toBe("true");
    expect(panel().getAttribute("aria-label")).toBe("Title aaaa1111");
    expect(trigger.closest("[inert]")).not.toBeNull();
    trigger.remove();
  });

  it("carries the reader prefs itself, since it renders outside .app-shell", async () => {
    await open({
      layout: "newspaper",
      accent: "rose",
      highlight: "none",
      bg: "gray",
      bilingual: true,
    });
    const el = panel();
    expect(el.classList.contains("app-shell")).toBe(true);
    expect(el.classList.contains("news-content")).toBe(true);
    expect(el.getAttribute("data-layout")).toBe("newspaper");
    expect(el.getAttribute("data-accent")).toBe("rose");
    expect(el.getAttribute("data-highlight")).toBe("none");
    expect(el.getAttribute("data-reader-bg")).toBe("gray");
    expect(el.getAttribute("data-bilingual")).toBe("on");
  });

  it("widens for the side-by-side view only when Vietnamese text exists", async () => {
    items.aaaa1111 = story("aaaa1111", {
      title_vi: "Tiêu đề",
      summary_vi: "Tóm tắt.",
    });
    await open({ bilingualDialog: true });
    expect(panel().className).toContain("w-[min(980px,100vw)]");
    cleanup();

    items.aaaa1111 = story("aaaa1111");
    await open({ bilingualDialog: true });
    expect(panel().className).toContain("w-[min(520px,100vw)]");
  });

  it("closes on Escape and returns focus to the control that opened it", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    function Harness() {
      const [shown, setShown] = useState(true);
      return shown ? (
        <StoryDialog
          idPrefix="aaaa1111"
          lang="en"
          onClose={() => setShown(false)}
        />
      ) : null;
    }
    await act(async () => {
      render(<Harness />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(document.activeElement).not.toBe(trigger);

    await press("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.closest("[inert]")).toBeNull();
    trigger.remove();
  });

  it("closes when the backdrop is pressed", async () => {
    const onClose = await open();
    const backdrop = document.querySelector('[data-slot="drawer-backdrop"]');
    if (!backdrop) throw new Error("missing drawer backdrop");
    await act(async () => {
      for (const type of [
        "pointerdown",
        "mousedown",
        "pointerup",
        "mouseup",
        "click",
      ]) {
        backdrop.dispatchEvent(
          new MouseEvent(type, { bubbles: true, cancelable: true })
        );
      }
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from the close button", async () => {
    const onClose = await open();
    await act(async () => {
      screen.getByRole("button", { name: "Close" }).click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("story dialog J and K", () => {
  beforeEach(() => {
    feedCache.cached = {
      days: [
        {
          date: "2023-11-14",
          categoryCounts: {},
          items: [story("aaaa1111"), story("bbbb2222"), story("cccc3333")],
        },
      ],
    } satisfies Partial<FeedResponse>;
  });

  it("J loads the next story of the day and K the previous one", async () => {
    await open();
    expect(screen.getByText("Summary aaaa1111.")).toBeTruthy();
    await press("j");
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetched).toEqual(["aaaa1111", "bbbb2222"]);
    expect(await screen.findByText("Summary bbbb2222.")).toBeTruthy();
    await press("k");
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetched.at(-1)).toBe("aaaa1111");
  });

  it("stops at the ends of the day", async () => {
    await open();
    await press("k");
    expect(fetched).toEqual(["aaaa1111"]);
  });

  it("leaves J and K to a text field and to a modifier", async () => {
    await open();
    const input = document.createElement("input");
    panel().appendChild(input);
    input.focus();
    await press("j");
    await press("j", { ctrlKey: true });
    expect(fetched).toEqual(["aaaa1111"]);
  });

  it("keeps focus on the step button while the next story loads", async () => {
    await open();
    const next = screen.getByRole("button", { name: "Next story" });
    next.focus();
    await act(async () => {
      next.click();
    });
    expect(screen.getByRole("button", { name: "Next story" })).toBe(next);
    expect(document.activeElement).toBe(next);
    expect(await screen.findByText("Summary bbbb2222.")).toBeTruthy();
    expect(document.activeElement).toBe(next);
  });

  it("offers the same moves as buttons", async () => {
    await open();
    await act(async () => {
      screen.getByRole("button", { name: "Next story" }).click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetched.at(-1)).toBe("bbbb2222");
  });
});

describe("story dialog layers", () => {
  it("closes only the image zoom on the first Escape, the drawer on the second", async () => {
    items.aaaa1111 = story("aaaa1111", { media_manifest: MEDIA });
    const onClose = await open();
    await act(async () => {
      screen.getByRole("button", { name: "Zoom image 1 of 1" }).click();
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    expect(screen.getByRole("dialog", { name: "Image" })).toBeTruthy();

    await press("Escape");
    expect(screen.queryByRole("dialog", { name: "Image" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(panel()).toBeTruthy();

    await press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not step through stories while the image zoom is open", async () => {
    items.aaaa1111 = story("aaaa1111", { media_manifest: MEDIA });
    feedCache.cached = {
      days: [
        {
          date: "2023-11-14",
          categoryCounts: {},
          items: [story("aaaa1111"), story("bbbb2222")],
        },
      ],
    };
    await open();
    await act(async () => {
      screen.getByRole("button", { name: "Zoom image 1 of 1" }).click();
    });
    await press("j");
    expect(fetched).toEqual(["aaaa1111"]);
  });
});

describe("story dialog load states", () => {
  it("shows a missing story and keeps the dialog named", async () => {
    await open({}, "dead0000");
    expect(screen.getByText("Story not found.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Story" })).toBeTruthy();
  });
});
