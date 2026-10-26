import { describe, expect, it } from "vitest";
import {
  checkFreshness,
  type FreshnessStory,
  judgeFreshness,
  type SearchHit,
  searchQuery,
} from "../freshness/check.js";
import {
  parseArticleDate,
  parseGoogleNewsRss,
} from "../freshness/providers.js";
import {
  FRESHNESS_RECHECK_S,
  freshnessCheck,
  runFreshnessCheck,
} from "../ingest/freshness.js";
import type { Env } from "../types.js";

const DAY = 86400;
const NOW = 1_793_000_000;

function story(over: Partial<FreshnessStory> = {}): FreshnessStory {
  return {
    id: "s1",
    title: "OpenAI launches GPT-7 model for coding agents",
    url: "https://openai.com/blog/gpt-7",
    publishedAt: NOW - 3600,
    sourceUrls: [],
    ...over,
  };
}

function hit(over: Partial<SearchHit> = {}): SearchHit {
  return {
    url: "https://theverge.com/gpt-7",
    title: "OpenAI launches GPT-7 coding model",
    domain: "theverge.com",
    publishedAt: NOW - 1800,
    provider: "hn",
    ...over,
  };
}

describe("judgeFreshness", () => {
  it("flags a story whose article predates our publish time by over a week", () => {
    // The Oct 2026 eval case: a blog post from Oct 1 resurfaced on HN Oct 24.
    const r = judgeFreshness(story(), NOW - 20 * DAY, [], NOW);
    expect(r.verdict).toBe("old_resurfaced");
  });

  it("flags a newer related report with a follow-up cue as superseded", () => {
    const r = judgeFreshness(
      story({ publishedAt: NOW - 10 * 3600 }),
      NOW - 10 * 3600,
      [
        hit({
          title: "OpenAI delays GPT-7 coding model launch",
          publishedAt: NOW - 3600,
        }),
      ],
      NOW
    );
    expect(r.verdict).toBe("superseded");
    expect(r.newerUrls).toEqual(["https://theverge.com/gpt-7"]);
  });

  it("does not call a follow-up story superseded by its own kind of news", () => {
    const r = judgeFreshness(
      story({ title: "OpenAI delays GPT-7 coding model launch" }),
      null,
      [
        hit({
          title: "OpenAI delays GPT-7 coding model again",
          publishedAt: NOW,
        }),
      ],
      NOW
    );
    expect(r.verdict).toBe("fresh");
  });

  it("calls an old story with no coverage in 48h stale, but not one still covered", () => {
    const old = story({ publishedAt: NOW - 4 * DAY });
    expect(judgeFreshness(old, NOW - 4 * DAY, [], NOW).verdict).toBe("stale");
    expect(judgeFreshness(old, NOW - 4 * DAY, [hit()], NOW).verdict).toBe(
      "fresh"
    );
  });

  it("counts distinct outlets, skipping aggregators and collapsing syndication", () => {
    const r = judgeFreshness(
      story({
        url: "https://www.techmeme.com/261026/p15",
        sourceUrls: [
          { url: "https://x.com/someone/status/1", postedAt: NOW },
          {
            url: "https://huggingnews.com/ai/gpt-7-launch-c8c6fe58",
            postedAt: null,
          },
          {
            url: "https://marketbrief.now/ai/gpt-7-launch-c8c6fe58",
            postedAt: NOW,
          },
        ],
      }),
      null,
      [
        hit(),
        hit({
          url: "https://news.ycombinator.com/item?id=1",
          domain: "ycombinator.com",
        }),
        hit({ url: "https://www.theverge.com/other", domain: "theverge.com" }),
        hit({
          url: "https://old.example.com/x",
          domain: "example.com",
          publishedAt: NOW - 5 * DAY,
        }),
        hit({
          url: "https://wired.com/x",
          domain: "wired.com",
          title: "Unrelated chip news",
        }),
      ],
      NOW
    );
    expect(r.domains.sort()).toEqual(["huggingnews.com", "theverge.com"]);
    expect(r.trendingSources).toBe(2);
  });
});

describe("checkFreshness", () => {
  it("records provider errors and reports unknown when every source failed", async () => {
    const r = await checkFreshness(
      story(),
      {
        articleDate: async () => {
          throw new Error("HTTP 403");
        },
        search: [
          {
            name: "hn",
            run: async () => {
              throw new Error("timeout");
            },
          },
        ],
      },
      NOW
    );
    expect(r.verdict).toBe("unknown");
    expect(r.errors).toEqual(["article openai.com: HTTP 403", "hn: timeout"]);
  });
});

describe("parsers", () => {
  it("reads JSON-LD and meta published dates", () => {
    expect(
      parseArticleDate(
        '<script>{"datePublished":"2026-10-01T18:58:00Z"}</script>'
      )
    ).toBe(Date.parse("2026-10-01T18:58:00Z") / 1000);
    expect(
      parseArticleDate(
        '<meta property="article:published_time" content="2026-10-22T04:26:00Z">'
      )
    ).toBe(Date.parse("2026-10-22T04:26:00Z") / 1000);
    expect(parseArticleDate("<html></html>")).toBeNull();
  });

  it("parses Google News items with the outlet domain", () => {
    const xml =
      '<item><title>Sweden blocks ChatGPT - Reuters</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Sun, 25 Oct 2026 12:00:00 GMT</pubDate><source url="https://www.reuters.com">Reuters</source></item>';
    expect(parseGoogleNewsRss(xml)).toEqual([
      {
        url: "https://news.google.com/rss/articles/abc",
        title: "Sweden blocks ChatGPT - Reuters",
        domain: "reuters.com",
        publishedAt: Date.parse("2026-10-25T12:00:00Z") / 1000,
        provider: "gnews",
      },
    ]);
  });

  it("builds a short query without the author credit", () => {
    expect(
      searchQuery(
        "Meta plans to raise $95B to finance its AI expansion (Tim Bradshaw/Financial Times)"
      )
    ).toBe("meta raise $95b finance ai expansion");
  });
});

function fakeEnv(
  items: { id: string; checked_at: number | null }[],
  writes: unknown[][]
): Env {
  const prepare = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      sql,
      args,
      all: async () =>
        sql.includes("FROM items")
          ? {
              results: items.map((i) => ({
                ...i,
                title: "OpenAI launches GPT-7 model",
                url: `https://openai.com/${i.id}`,
                published_at: NOW - 3600,
              })),
            }
          : { results: [] },
    }),
  });
  return {
    FRESHNESS_CHECK: "shadow",
    DB: {
      prepare,
      batch: async (stmts: { args: unknown[] }[]) => {
        for (const s of stmts) writes.push(s.args);
        return [];
      },
    },
  } as unknown as Env;
}

describe("runFreshnessCheck", () => {
  it("checks only stories not checked recently and stores one row each", async () => {
    const writes: unknown[][] = [];
    const env = fakeEnv(
      [
        { id: "a", checked_at: null },
        { id: "b", checked_at: NOW - 60 },
        { id: "c", checked_at: NOW - FRESHNESS_RECHECK_S },
      ],
      writes
    );
    const stats = await runFreshnessCheck(env, "run-1", NOW * 1000, {
      articleDate: async () => NOW - 3600,
      search: [{ name: "hn", run: async () => [] }],
    });
    expect(stats).toMatchObject({
      checked: 2,
      cached: 1,
      verdicts: { fresh: 2 },
    });
    expect(writes.map((w) => [w[0], w[2], w[3], w[9]])).toEqual([
      ["a", "run-1", "fresh", "hn"],
      ["c", "run-1", "fresh", "hn"],
    ]);
  });
});

describe("freshnessCheck step", () => {
  it("skips without touching D1 when the flag is not shadow", async () => {
    const steps: { name: string; action: string; reason?: string }[] = [];
    await freshnessCheck({
      env: { FRESHNESS_CHECK: "off" } as Env,
      steps,
    } as never);
    expect(steps).toEqual([
      { name: "freshness", action: "skipped", reason: "flag off" },
    ]);
  });
});
