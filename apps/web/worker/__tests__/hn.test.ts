import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HN_SCOPE_SOURCE } from "../sources/catalog.js";
import { hnAdapter } from "../sources/hn.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    path.join(dirname, "../sources/__fixtures__/hn-algolia.json"),
    "utf-8"
  )
);

describe("hnAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () => new Response(JSON.stringify(fixture)))
    );
  });

  it("filters to AI-keyword titles and dedupes across the two searches", async () => {
    const items = await hnAdapter.fetchItems({ popularMinPoints: 40 }, 0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(items.map((i) => i.url).sort()).toEqual(
      [
        "https://example.com/claude-model",
        "https://example.com/agent-framework",
      ].sort()
    );
  });

  it("excludes non-AI stories like the todo app", async () => {
    const items = await hnAdapter.fetchItems({}, 0);
    expect(items.some((i) => i.url === "https://example.com/todo-app")).toBe(
      false
    );
  });

  it("maps points/comments correctly", async () => {
    const items = await hnAdapter.fetchItems({}, 0);
    const claude = items.find((i) => i.externalId === "1001");
    expect(claude).toMatchObject({ points: 250, comments: 80 });
  });

  it("attaches a single 'discussion' source pointing at the HN thread", async () => {
    const items = await hnAdapter.fetchItems({}, 0);
    const claude = items.find((i) => i.externalId === "1001");
    expect(claude?.sources).toEqual([
      {
        kind: "discussion",
        author: "someuser",
        postedAt: 1780000000,
        url: "https://news.ycombinator.com/item?id=1001",
      },
    ]);
  });

  it("adds a points-range search only when popularMinPoints is set", async () => {
    await hnAdapter.fetchItems({}, 100);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.mocked(fetch).mockClear();
    await hnAdapter.fetchItems({ popularMinPoints: 40 }, 100);
    expect(fetch).toHaveBeenCalledTimes(2);
    const urls = vi.mocked(fetch).mock.calls.map((c) => new URL(String(c[0])));
    const popular = urls.find((u) => u.searchParams.get("tags") === "story");
    expect(popular?.searchParams.get("numericFilters")).toBe(
      "created_at_i>100,points>=40"
    );
  });

  it("still applies the AI keyword filter and dedupe to the popular range", async () => {
    const items = await hnAdapter.fetchItems({ popularMinPoints: 40 }, 0);
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.url === "https://example.com/todo-app")).toBe(
      false
    );
  });
});

interface Story {
  objectID: string;
  title: string;
  url: string;
  points: number;
  created_at_i: number;
  frontPage?: boolean;
}

/** HN Algolia's behavior, enough of it to judge a request: every query word
 *  is required (so `OR` is a word), `numericFilters` bound the window and
 *  points, `search_by_date` returns newest first, `search` with no query
 *  ranks by points, and a response never holds more than `hitsPerPage` hits. */
function algolia(corpus: readonly Story[]) {
  return async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const tags = url.searchParams.get("tags");
    const words = (url.searchParams.get("query") ?? "")
      .toLowerCase()
      .replaceAll('"', "")
      .split(/\s+/)
      .filter(Boolean);
    const filters = (url.searchParams.get("numericFilters") ?? "")
      .split(",")
      .filter(Boolean)
      .map((f) => {
        const m = /^(\w+)(>=|>|<=|<)(\d+)$/.exec(f);
        if (!m) throw new Error(`unparsed numericFilter ${f}`);
        return { field: m[1] as "created_at_i" | "points", op: m[2], n: +m[3] };
      });
    const hits = corpus.filter((s) => {
      if (tags === "front_page" && !s.frontPage) return false;
      const titleWords = new Set(s.title.toLowerCase().split(/\W+/));
      if (!words.every((w) => titleWords.has(w))) return false;
      return filters.every(({ field, op, n }) => {
        const v = s[field];
        if (op === ">") return v > n;
        if (op === ">=") return v >= n;
        if (op === "<") return v < n;
        return v <= n;
      });
    });
    const byDate = url.pathname.endsWith("/search_by_date");
    hits.sort((a, b) =>
      byDate ? b.created_at_i - a.created_at_i : b.points - a.points
    );
    const perPage = Number(url.searchParams.get("hitsPerPage") ?? 20);
    return new Response(JSON.stringify({ hits: hits.slice(0, perPage) }));
  };
}

describe("hnAdapter against Algolia's search semantics (#873)", () => {
  const since = 1_780_000_000;
  const story = (
    objectID: string,
    title: string,
    points: number,
    extra: Partial<Story> = {}
  ): Story => ({
    objectID,
    title,
    url: `https://example.com/${objectID}`,
    points,
    created_at_i: since + 600,
    ...extra,
  });
  // 120 popular non-AI stories outrank the late risers, as in a busy 26h
  // window, so a 100-hit page cuts them off.
  const busyDay = Array.from({ length: 120 }, (_, i) =>
    story(`f${i}`, `Show HN: A todo app, take ${i}`, 300)
  );
  const corpus: Story[] = [
    story("front", "New Claude model beats GPT on benchmarks", 250, {
      frontPage: true,
    }),
    story("muse", "Muse Spark Open, the most capable open-weight model", 71),
    ...busyDay,
    story("riser", "Frontier Pre-Training at Microsoft AI", 45),
    story("revenue", "Anthropic revenue jumps to $16.8B in third quarter", 25),
    // The newest story in the window, so a newest-first search returns it.
    story("hub", "AI Prompt Hub: 150 categories of ready-to-use prompts", 2, {
      created_at_i: since + 5000,
    }),
    story("old", "OpenAI ships a new reasoning model", 500, {
      created_at_i: since - 1,
    }),
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(algolia(corpus)));
  });

  describe.each([
    {
      row: "the 0043 row (an `OR` query, floor 40)",
      config: HN_SCOPE_SOURCE.config,
      expected: ["front", "muse", "riser"],
    },
    {
      row: "a floor of 20 and no query",
      config: { popularMinPoints: 20 },
      expected: ["front", "muse", "revenue", "riser"],
    },
  ])("with $row", ({ config, expected }) => {
    const ids = async () => {
      const items = await hnAdapter.fetchItems(config, since);
      return items.map((i) => i.externalId).sort();
    };

    it("adds popular AI stories that never reached the front page", async () => {
      // Defect: an `A OR B` query requires the word `OR`, so the popular
      // search matched nothing and HN was front page only.
      expect(await ids()).toContain("muse");
    });

    it("keeps a late riser that a 100-hit page would cut off", async () => {
      // Defect: a busy window holds more than 100 stories over the floor,
      // and the cut drops the ones that crossed it last.
      expect(await ids()).toContain("riser");
    });

    it("leaves out low-point AI posts and stories older than the window", async () => {
      // Defect: an unfloored newest-first search sends every 1-2 point AI
      // post to the scorer, about 250 a day.
      const got = await ids();
      expect(got).not.toContain("hub");
      expect(got).not.toContain("old");
      expect(got).toEqual(expected);
    });

    it("never sends an Algolia query", async () => {
      // Defect: the row's `query` reaches Algolia and every word, `OR`
      // included, is required.
      await ids();
      const queries = vi
        .mocked(fetch)
        .mock.calls.map((c) => new URL(String(c[0])).searchParams.get("query"));
      expect(queries).toEqual(queries.map(() => null));
    });
  });
});
