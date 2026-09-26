import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { boundFeedResponse, FEED_RESPONSE_MAX_BYTES } from "./feed-queries";
import type { FeedResponse } from "./types";

const here = dirname(fileURLToPath(import.meta.url));

describe("boundFeedResponse", () => {
  it("enforces a total serialized budget for a hostile feed payload", () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      id: `id-${i}`,
      url: `https://example.com/${i}`,
      title: "t".repeat(2_000),
      title_vi: "v".repeat(2_000),
      summary: "s".repeat(20_000),
      summary_vi: "s".repeat(20_000),
      category: "category",
      published_at: 1_700_000_000 + i,
      points: 1,
      comments: 1,
      rank_score: 1,
      source_id: "source",
      tags: Array.from({ length: 100 }, (_, j) => `tag-${j}`),
      sources: Array.from({ length: 100 }, (_, j) => ({
        kind: "source" as const,
        author: "a",
        posted_at: 1,
        quote: "q".repeat(2_000),
        url: `https://source.example/${j}`,
      })),
      llm_tokens: 0,
      image_url: `https://img.example/${i}.jpg`,
      media_manifest: {
        version: 1 as const,
        assets: [
          { type: "image" as const, url: `https://img.example/${i}.jpg` },
        ],
      },
    }));
    const feed: FeedResponse = {
      tldr: null,
      days: [
        {
          date: "2026-08-27",
          items,
          categoryCounts: { category: items.length },
        },
      ],
      categories: [{ name: "category", count: items.length }],
      trending: [],
      totalStories: items.length,
      updatedAt: 1,
      lastFetchedAt: 1,
      hasMore: true,
    };

    const bounded = boundFeedResponse(feed);
    expect(
      new TextEncoder().encode(JSON.stringify(bounded)).length
    ).toBeLessThanOrEqual(FEED_RESPONSE_MAX_BYTES);
    expect(bounded.totalStories).toBe(items.length);
  });
});

describe("feed hydration state", () => {
  it("does not mutate highlight state while producing an SSR feed", () => {
    const source = readFileSync(join(here, "feed-queries.ts"), "utf8");

    expect(source).not.toContain("setLearnedKeywords(learnedKeywords);");
  });
});
