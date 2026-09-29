import { afterEach, describe, expect, it, vi } from "vitest";
import { healthHandler } from "../routes/api/health";
import { LATEST_RUN_SQL } from "./feed-freshness";

const NOW_SEC = 1_800_000_000;

function makeDb(run: Record<string, unknown> | null) {
  const prepare = vi.fn((sql: string) => ({
    first: async () => (sql === LATEST_RUN_SQL ? run : { last: NOW_SEC }),
  }));
  return { withSession: () => ({ prepare }) } as unknown as D1Database;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("health handler", () => {
  it("returns 200 when the newest run is recent and clean", async () => {
    vi.useFakeTimers({ now: NOW_SEC * 1000 });
    const db = makeDb({
      id: "r1",
      started_at: NOW_SEC - 600,
      finished_at: NOW_SEC - 300,
      error: null,
      stats: "{}",
    });
    const res = await healthHandler({ context: { env: { DB: db } } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "ok",
      lastFetchedAt: NOW_SEC,
    });
  });

  // Uptime monitors key off the status code, so "down" must not be 200.
  it("returns 503 when the newest run failed", async () => {
    vi.useFakeTimers({ now: NOW_SEC * 1000 });
    const db = makeDb({
      id: "r1",
      started_at: NOW_SEC - 600,
      finished_at: NOW_SEC - 300,
      error: "Provider request failed",
      stats: "{}",
    });
    const res = await healthHandler({ context: { env: { DB: db } } });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ status: "down" });
  });

  it("returns 503 without caching when D1 is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await healthHandler({ context: { env: {} } });
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
