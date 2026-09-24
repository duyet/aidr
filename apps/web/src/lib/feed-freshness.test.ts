import { describe, expect, it, vi } from "vitest";
import {
  FEED_FRESHNESS_CACHE_CONTROL,
  feedFreshnessResponse,
  getFeedFreshness,
  LAST_FETCHED_AT_SQL,
} from "./feed-freshness";

function fakeDb(row: { last: number | null } | null) {
  const first = vi.fn(async () => row);
  const prepare = vi.fn((sql: string) => ({ sql, first }));
  return {
    db: { prepare } as unknown as D1Database,
    prepare,
    first,
  };
}

describe("getFeedFreshness", () => {
  it("uses the feed's published-item MAX(fetched_at) query", async () => {
    const { db, prepare, first } = fakeDb({ last: 1_700_000_042 });

    await expect(getFeedFreshness(db)).resolves.toEqual({
      lastFetchedAt: 1_700_000_042,
    });
    expect(prepare).toHaveBeenCalledWith(LAST_FETCHED_AT_SQL);
    expect(LAST_FETCHED_AT_SQL).toBe(
      "SELECT MAX(fetched_at) AS last FROM items WHERE status = 'published'"
    );
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("keeps the null result when there are no published items", async () => {
    const { db } = fakeDb(null);
    await expect(getFeedFreshness(db)).resolves.toEqual({
      lastFetchedAt: null,
    });
  });
});

describe("feedFreshnessResponse", () => {
  it("returns the small cached JSON shape", async () => {
    const response = feedFreshnessResponse({ lastFetchedAt: 42 });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      FEED_FRESHNESS_CACHE_CONTROL
    );
    await expect(response.json()).resolves.toEqual({ lastFetchedAt: 42 });
  });
});
