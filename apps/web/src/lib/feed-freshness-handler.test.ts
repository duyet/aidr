import { afterEach, describe, expect, it, vi } from "vitest";
import { feedFreshnessHandler } from "../routes/api/feed.freshness";
import { NEWEST_PUBLISHED_FETCHED_AT_SQL } from "./feed-freshness";

function makeDb(
  row: { last: number | null } | null,
  options: { fail?: boolean } = {}
) {
  const first = vi.fn(async () => {
    if (options.fail) throw new Error("D1 unavailable");
    return row;
  });
  const sessionPrepare = vi.fn((sql: string) => ({ sql, first }));
  const session = { prepare: sessionPrepare };
  const withSession = vi.fn(() => session);
  const db = { withSession } as unknown as D1Database;
  return { db, withSession, sessionPrepare, first };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("feed freshness handler", () => {
  it("reads the published-item timestamp from a first-primary D1 session", async () => {
    const { db, withSession, sessionPrepare } = makeDb({
      last: 1_700_000_042,
    });

    const response = await feedFreshnessHandler({
      context: { env: { DB: db } },
    });

    expect(withSession).toHaveBeenCalledWith("first-primary");
    expect(sessionPrepare).toHaveBeenCalledWith(
      NEWEST_PUBLISHED_FETCHED_AT_SQL
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=60, s-maxage=120"
    );
    await expect(response.json()).resolves.toEqual({
      lastFetchedAt: 1_700_000_042,
    });
  });

  it("does not cache a missing D1 binding", async () => {
    const response = await feedFreshnessHandler({
      context: { env: {} },
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not cache a query failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = makeDb(null, { fail: true });

    const response = await feedFreshnessHandler({
      context: { env: { DB: db } },
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
