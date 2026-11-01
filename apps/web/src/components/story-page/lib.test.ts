/**
 * Small rules behind the story page: which key presses are shortcuts (never
 * while typing, never with Cmd/Ctrl/Alt, never under a modal), which
 * sources make the one-line list, and which stories "Read next" offers.
 */
import { describe, expect, it } from "vitest";
import type { FeedItem } from "../../lib/types";
import {
  nextArchiveDate,
  shortDayLabel,
  splitSources,
  storyByline,
} from "./lib";
import { pickReadNext, readNextUrl } from "./ReadNext";
import { storyKeyAction } from "./use-story-keys";

const key = (
  k: string,
  extra: Partial<Parameters<typeof storyKeyAction>[0]> = {}
) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  defaultPrevented: false,
  target: null,
  ...extra,
});

describe("storyKeyAction", () => {
  it("maps the page keys, upper or lower case", () => {
    expect(storyKeyAction(key("j"), false)).toBe("next");
    expect(storyKeyAction(key("K"), false)).toBe("prev");
    expect(storyKeyAction(key("c"), false)).toBe("copy");
    expect(storyKeyAction(key("o"), false)).toBe("original");
    expect(storyKeyAction(key("s"), false)).toBe("sources");
    expect(storyKeyAction(key("?", {}), false)).toBe("help");
    expect(storyKeyAction(key("Escape"), false)).toBe("escape");
    expect(storyKeyAction(key("x"), false)).toBeNull();
  });

  it("leaves browser shortcuts and typing alone", () => {
    expect(storyKeyAction(key("c", { metaKey: true }), false)).toBeNull();
    expect(storyKeyAction(key("c", { ctrlKey: true }), false)).toBeNull();
    expect(storyKeyAction(key("j", { altKey: true }), false)).toBeNull();
    const input = { tagName: "INPUT" } as unknown as EventTarget;
    const editable = {
      tagName: "DIV",
      isContentEditable: true,
    } as unknown as EventTarget;
    expect(storyKeyAction(key("j", { target: input }), false)).toBeNull();
    expect(storyKeyAction(key("j", { target: editable }), false)).toBeNull();
  });

  it("yields to an open modal, which owns Esc and Tab", () => {
    expect(storyKeyAction(key("j"), true)).toBeNull();
    expect(storyKeyAction(key("Escape"), true)).toBeNull();
  });
});

const base: FeedItem = {
  id: "aaaaaaaa00000000",
  url: "https://www.wsj.com/a",
  title: "T",
  title_vi: null,
  summary: null,
  summary_vi: null,
  category: "Funding",
  // 2026-10-31 09:30 in Vietnam.
  published_at: Math.floor(Date.parse("2026-10-31T02:30:00Z") / 1000),
  points: 0,
  comments: 0,
  rank_score: 5,
  source_id: "x",
  tags: [],
  sources: [],
  llm_tokens: 0,
  image_url: null,
};

describe("sources", () => {
  it("puts the article first, dedupes it, and moves the rest behind more", () => {
    const { main, more } = splitSources({
      url: base.url,
      sources: [
        {
          kind: "source",
          author: "Techmeme",
          posted_at: null,
          quote: null,
          url: "https://x.com/Techmeme/status/1",
        },
        {
          kind: "source",
          author: null,
          posted_at: null,
          quote: null,
          url: "https://www.wsj.com/a",
        },
        {
          kind: "support",
          author: "FT",
          posted_at: null,
          quote: null,
          url: "https://ft.com/b",
        },
        {
          kind: "source",
          author: null,
          posted_at: null,
          quote: null,
          url: null,
        },
      ],
    });
    expect(main.map((s) => s.label)).toEqual(["wsj.com", "@Techmeme"]);
    expect(more.map((s) => s.author)).toEqual(["FT"]);
  });

  it("bylines the article author, not an aggregator that reposted it", () => {
    expect(
      storyByline(
        {
          url: base.url,
          sources: [
            {
              kind: "source",
              author: "Techmeme",
              posted_at: null,
              quote: null,
              url: "https://x.com/Techmeme/status/1",
            },
            {
              kind: "source",
              author: "Berber Jin",
              posted_at: null,
              quote: null,
              url: base.url,
            },
          ],
        },
        "vi"
      )
    ).toBe("Theo Berber Jin · wsj.com");
    expect(storyByline({ url: base.url, sources: [] }, "en")).toBe(
      "From wsj.com"
    );
    expect(
      storyByline(
        {
          url: base.url,
          sources: [
            {
              kind: "source",
              author: "Techmeme",
              posted_at: null,
              quote: null,
              url: "https://x.com/Techmeme/status/1",
            },
          ],
        },
        "en"
      )
    ).toBe("From wsj.com");
  });
});

describe("dates", () => {
  it("labels an archive day without moving it to UTC", () => {
    expect(shortDayLabel("2026-10-31", "vi")).toBe("31.10.2026");
    expect(shortDayLabel("2026-10-31", "en")).toBe("Oct 31, 2026");
    expect(nextArchiveDate("2026-10-31")).toBe("2026-11-01");
  });
});

describe("read next", () => {
  it("asks for one day of the story's category with an explicit lang", () => {
    expect(readNextUrl(base, "vi")).toBe(
      "/api/feed?days=1&before=2026-11-01&category=Funding&lang=vi"
    );
  });

  it("offers the day's best other stories, never the story itself", () => {
    const at = (id: string, score: number, dayShift = 0): FeedItem => ({
      ...base,
      id,
      rank_score: score,
      published_at: base.published_at + dayShift * 86400,
    });
    const feed = {
      days: [
        {
          date: "2026-10-31",
          categoryCounts: {},
          items: [
            at("self", 99),
            at("b", 3),
            at("c", 8),
            at("d", 5),
            at("e", 1),
            at("old", 50, -1),
          ],
        },
      ],
    };
    expect(pickReadNext(feed, at("self", 99)).map((i) => i.id)).toEqual([
      "c",
      "d",
      "b",
    ]);
    expect(pickReadNext(null, base)).toEqual([]);
  });
});
