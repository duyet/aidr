import { describe, expect, it } from "vitest";
import {
  attributeSources,
  type ItemId,
  parseUnmergePairs,
  planUnmerge,
  type StoredSource,
  UNMERGE_QUIET_SEC,
  type UnmergeItemRow,
} from "../unmerge/plan.js";

const NOW_MS = Date.UTC(2026, 9, 14, 3);
const OLD = NOW_MS / 1000 - 10 * 86_400;
const hex = (n: number) => n.toString(16).padStart(64, "0") as ItemId;

function item(
  n: number,
  sourceId: string,
  url: string,
  extra: Partial<UnmergeItemRow> = {}
): UnmergeItemRow {
  return {
    id: hex(n),
    source_id: sourceId,
    url,
    title: `story ${n}`,
    summary: null,
    status: "merged",
    duplicate_of: hex(1),
    points: 0,
    comments: 0,
    tags: "[]",
    image_url: null,
    media_manifest: null,
    published_at: OLD,
    fetched_at: OLD + 600,
    llm_relevance: 0.9,
    llm_importance: 5,
    llm_quality: 5,
    rank_score: 1,
    source_lang: "en",
    vote_net: 0,
    notifications: 0,
    has_vi: 0,
    ...extra,
  };
}

const tweet = (handle: string): StoredSource => ({
  kind: "support",
  author: `@${handle}`,
  posted_at: OLD - 100,
  quote: null,
  url: `https://x.com/${handle}/status/1`,
});
const entry = (sourceId: string, url: string): StoredSource => ({
  kind: "source",
  author: sourceId,
  posted_at: null,
  quote: null,
  url,
});
const self = (url: string, postedAt = OLD): StoredSource => ({
  kind: "source",
  author: null,
  posted_at: postedAt,
  quote: null,
  url,
});

describe("parseUnmergePairs", () => {
  const a = hex(1);
  const b = hex(2);
  const c = hex(3);
  it("rejects input that would restore a story twice or split a group", () => {
    expect(
      parseUnmergePairs([{ canonicalId: a, mergedId: "abc" }])
    ).toHaveProperty("error");
    expect(
      parseUnmergePairs([
        { canonicalId: a, mergedId: b },
        { canonicalId: c, mergedId: b },
      ])
    ).toHaveProperty("error");
    expect(
      parseUnmergePairs([
        { canonicalId: a, mergedId: b, group: "g" },
        { canonicalId: c, mergedId: hex(4), group: "g" },
      ])
    ).toHaveProperty("error");
    expect(
      parseUnmergePairs([
        { canonicalId: a, mergedId: b },
        { canonicalId: b, mergedId: c },
      ])
    ).toHaveProperty("error");
  });

  it("defaults a pair's group to its merged id", () => {
    expect(parseUnmergePairs([{ canonicalId: a, mergedId: b }])).toEqual({
      pairs: [{ canonicalId: a, mergedId: b, group: b }],
    });
  });
});

describe("attributeSources", () => {
  // Production 8d0ba39a: a marketbrief canonical, its correct huggingnews
  // twin, then a wrong huggingnews/marketbrief pair whose URL rows the
  // 8-row cap dropped.
  const canonical = item(
    1,
    "marketbrief",
    "https://marketbrief.now/kospi-c549",
    {
      status: "published",
      duplicate_of: null,
    }
  );
  const twin = item(2, "huggingnews", "https://huggingnews.com/kospi-c549");
  const wrongHug = item(
    3,
    "huggingnews",
    "https://huggingnews.com/openai-13c2",
    {
      fetched_at: OLD + 900,
    }
  );
  const wrongMb = item(
    4,
    "marketbrief",
    "https://marketbrief.now/openai-13c2",
    {
      fetched_at: OLD + 900,
    }
  );
  const rows = [
    self(canonical.url),
    tweet("techmeme"),
    tweet("marionawfal"),
    entry("huggingnews", twin.url),
    tweet("techmeme2"),
    tweet("dylfreed"),
    tweet("micahcarroll"),
    tweet("marcus"),
  ];
  const groupOf = new Map([
    [wrongHug.id as string, "openai"],
    [wrongMb.id as string, "openai"],
  ]);

  it("gives a tweet run to the member whose URL row ends it, and capped trailing rows to the one group missing its URL row", () => {
    const owners = attributeSources(
      canonical,
      [twin, wrongHug, wrongMb],
      rows,
      groupOf
    ).map((a) => [a.owner, a.rule]);
    expect(owners).toEqual([
      [canonical.id, "url"],
      [twin.id, "run-before-member"],
      [twin.id, "run-before-member"],
      [twin.id, "url"],
      [wrongHug.id, "trailing-capped"],
      [wrongHug.id, "trailing-capped"],
      [wrongHug.id, "trailing-capped"],
      [wrongHug.id, "trailing-capped"],
    ]);
  });

  it("never moves a tweet-sourced canonical's leading tweets, and flags them", () => {
    // Production d7a217b1: eight tweets and no member URL row at all.
    const hugCanonical = item(
      5,
      "huggingnews",
      "https://huggingnews.com/own-3332",
      {
        status: "published",
        duplicate_of: null,
      }
    );
    const attribution = attributeSources(
      hugCanonical,
      [wrongHug, wrongMb],
      ["a", "b", "c"].map(tweet),
      groupOf
    );
    expect(attribution.every((a) => a.owner === hugCanonical.id)).toBe(true);
    expect(attribution.every((a) => a.ambiguous)).toBe(true);
  });

  it("matches an HN or Lobsters discussion row to the item it was posted with", () => {
    const hnCanonical = item(6, "hn", "https://example.test/a", {
      status: "published",
      duplicate_of: null,
      published_at: OLD - 5000,
    });
    const hnLoser = item(7, "hn", "https://example.test/b");
    const discussion = (postedAt: number): StoredSource => ({
      kind: "discussion",
      author: "someone",
      posted_at: postedAt,
      quote: null,
      url: `https://news.ycombinator.com/item?id=${postedAt}`,
    });
    const owners = attributeSources(
      hnCanonical,
      [hnLoser],
      [discussion(OLD - 5000), discussion(OLD), entry("hn", hnLoser.url)],
      new Map([[hnLoser.id as string, hnLoser.id as string]])
    ).map((a) => a.owner);
    expect(owners).toEqual([hnCanonical.id, hnLoser.id, hnLoser.id]);
  });
});

describe("planUnmerge", () => {
  const canonical = item(1, "hn", "https://example.test/c", {
    status: "published",
    duplicate_of: null,
    rank_score: 0.5,
  });
  const snapshot = (rows: UnmergeItemRow[], sources: StoredSource[] = []) => ({
    items: new Map(rows.map((r) => [r.id as string, r])),
    sources: new Map([[canonical.id as string, sources]]),
  });

  it("restores a VI-source row with the native translations row ingest writes", () => {
    const vi = item(8, "vnexpress-tech", "https://vnexpress.net/a.html", {
      title: "Tàu SpaceX lập kỷ lục",
      summary: "Tóm tắt.",
      source_lang: "vi",
    });
    const plan = planUnmerge(
      [{ canonicalId: canonical.id, mergedId: vi.id, group: vi.id }],
      snapshot([canonical, vi], [self(vi.url)]),
      NOW_MS
    );
    expect(plan.canonicals[0].viTranslations).toEqual([
      { itemId: vi.id, title: "Tàu SpaceX lập kỷ lục", summary: "Tóm tắt." },
    ]);
  });

  it("restores a row under the relevance bar as rejected, as ingest would have", () => {
    const low = item(9, "latent-space", "https://example.test/ainews", {
      llm_relevance: 0.1,
    });
    const plan = planUnmerge(
      [{ canonicalId: canonical.id, mergedId: low.id, group: low.id }],
      snapshot([canonical, low]),
      NOW_MS
    );
    expect(plan.canonicals[0].pairs[0].outcome).toEqual({
      action: "restore",
      leadId: low.id,
      status: "rejected",
    });
  });

  it("waits while the story is inside the send window, then restores it", () => {
    const recent = item(10, "techcrunch-ai", "https://example.test/recent", {
      published_at: NOW_MS / 1000 - UNMERGE_QUIET_SEC + 3600,
    });
    const pairs = [
      { canonicalId: canonical.id, mergedId: recent.id, group: recent.id },
    ];
    const now = planUnmerge(pairs, snapshot([canonical, recent]), NOW_MS);
    expect(now.canonicals[0].pairs[0].outcome).toMatchObject({
      action: "skip",
      reason: "inside-quiet-window",
    });
    expect(now.canonicals[0].rows).toEqual([]);
    const later = planUnmerge(
      pairs,
      snapshot([canonical, recent]),
      NOW_MS + 2 * 3600 * 1000
    );
    expect(later.canonicals[0].pairs[0].outcome.action).toBe("restore");
  });
});
