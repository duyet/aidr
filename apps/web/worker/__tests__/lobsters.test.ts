import { beforeEach, describe, expect, it, vi } from "vitest";
import { lobstersAdapter } from "../sources/lobsters.js";

const NOW = Date.now();
const recent = new Date(NOW - 60_000).toISOString();

function story(id: string, title: string) {
  return {
    short_id: id,
    title,
    url: `https://example.com/${id}`,
    created_at: recent,
    score: 5,
    comment_count: 1,
    submitter_user: "u",
    comments_url: `https://lobste.rs/s/${id}`,
  };
}

const TAGS: Record<string, ReturnType<typeof story>[]> = {
  ai: [story("a1", "Text-to-meowdio models")],
  ml: [story("m1", "Sequence weighting at scale")],
  vibecoding: [],
  programming: [
    story("p1", "Building an AI agent loop in 200 lines"),
    story("p2", "Why our build cache misses"),
  ],
  security: [
    story("s1", "Fake npm packages spread a worm"),
    story("a1", "Text-to-meowdio models"),
    story("s2", "Prompt injection against an LLM gateway"),
  ],
};

let requested: string[];

beforeEach(() => {
  requested = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const tag = new URL(String(input)).pathname
        .replace("/t/", "")
        .replace(".json", "");
      requested.push(tag);
      return tag in TAGS
        ? new Response(JSON.stringify(TAGS[tag]))
        : new Response("nope", { status: 404 });
    })
  );
});

describe("lobstersAdapter", () => {
  it("keeps the default tags when no extra tags are configured", async () => {
    const items = await lobstersAdapter.fetchItems({}, 0);
    expect(requested.sort()).toEqual(["ai", "ml", "vibecoding"]);
    expect(items.map((i) => i.externalId).sort()).toEqual(["a1", "m1"]);
  });

  it("takes every story from tags, but only AI titles from filteredTags", async () => {
    const items = await lobstersAdapter.fetchItems(
      {
        tags: ["ai", "ml", "vibecoding"],
        filteredTags: ["programming", "security"],
      },
      0
    );
    const ids = items.map((i) => i.externalId).sort();
    // p2 (build cache) and s1 (npm worm) are not AI titles and are dropped.
    expect(ids).toEqual(["a1", "m1", "p1", "s2"]);
  });

  it("does not fetch a filtered tag twice or double-count a story", async () => {
    const items = await lobstersAdapter.fetchItems(
      { tags: ["ai"], filteredTags: ["ai", "security"] },
      0
    );
    expect(requested.filter((t) => t === "ai")).toHaveLength(1);
    expect(items.filter((i) => i.externalId === "a1")).toHaveLength(1);
  });

  it("survives a filtered tag that returns an error", async () => {
    const items = await lobstersAdapter.fetchItems(
      { tags: ["ai"], filteredTags: ["not-a-tag", "programming"] },
      0
    );
    expect(items.map((i) => i.externalId).sort()).toEqual(["a1", "p1"]);
  });
});
