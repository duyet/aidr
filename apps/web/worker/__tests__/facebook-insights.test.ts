import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import {
  FACEBOOK_STATS_MAX_POSTS,
  type FacebookStatsEnv,
  syncFacebookPostStats,
} from "../notify/facebook-insights.js";

const MIGRATION = readFileSync(
  new URL("../../migrations/0073_post_stats.sql", import.meta.url),
  "utf8"
);
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const TOKEN = ["page", "token", "value"].join("-");

function d1(sqlite: DatabaseSync): FacebookStatsEnv["DB"] {
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind: (...a: unknown[]) => {
        args = a;
        return stmt;
      },
      first: async () => sqlite.prepare(sql).get(...(args as never[])) ?? null,
      all: async () => ({
        results: sqlite.prepare(sql).all(...(args as never[])),
      }),
      run: async () => {
        sqlite.prepare(sql).run(...(args as never[]));
        return { success: true };
      },
    };
    return stmt;
  };
  return {
    prepare,
    batch: async (stmts: { run: () => Promise<unknown> }[]) =>
      Promise.all(stmts.map((s) => s.run())),
  } as unknown as FacebookStatsEnv["DB"];
}

function setup(posts: { id: string; ageDays: number; status?: string }[]) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE notifications (
    channel TEXT, item_id TEXT, status TEXT, message_id TEXT, posted_at INTEGER)`);
  sqlite.exec(MIGRATION);
  posts.forEach((p, i) => {
    sqlite
      .prepare("INSERT INTO notifications VALUES (?, ?, ?, ?, ?)")
      .run(
        "facebook-en",
        `story-${i}`,
        p.status ?? "sent",
        p.id,
        NOW - p.ageDays * 86_400_000
      );
  });
  const env: FacebookStatsEnv = {
    DB: d1(sqlite),
    FACEBOOK_PAGE_ID: "12345",
    FACEBOOK_PAGE_ACCESS_TOKEN: TOKEN,
  };
  const stats = () =>
    sqlite
      .prepare(
        "SELECT ref, day, impressions, clicks FROM post_stats ORDER BY ref"
      )
      .all();
  return { env, stats };
}

function graph(byMetric: Record<string, unknown>) {
  return vi.fn(async (url: string | URL | Request) => {
    const metric = new URL(String(url)).searchParams.get("metric") ?? "";
    return new Response(JSON.stringify(byMetric[metric] ?? {}), {
      status: 200,
    });
  }) as unknown as typeof fetch;
}

const value = (v: number) => ({ data: [{ values: [{ value: v }] }] });

describe("syncFacebookPostStats", () => {
  it("stores lifetime impressions and clicks per post for the day", async () => {
    const { env, stats } = setup([{ id: "1_a", ageDays: 1 }]);
    const fetcher = graph({
      post_media_view: value(120),
      post_clicks: value(7),
    });
    expect(await syncFacebookPostStats(env, { now: NOW, fetcher })).toEqual({
      status: "synced",
      posts: 1,
    });
    expect(stats()).toEqual([
      { ref: "1_a", day: "2026-10-21", impressions: 120, clicks: 7 },
    ]);
    const urls = vi.mocked(fetcher).mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("/1_a/insights?metric=post_media_view");
    expect(urls.join()).not.toContain(TOKEN);
  });

  it("asks Graph once a day, not on every alarm", async () => {
    const { env } = setup([{ id: "1_a", ageDays: 1 }]);
    const fetcher = graph({ post_media_view: value(1), post_clicks: value(1) });
    await syncFacebookPostStats(env, { now: NOW, fetcher });
    const again = await syncFacebookPostStats(env, {
      now: NOW + 3_600_000,
      fetcher,
    });
    expect(again).toEqual({ status: "skipped", reason: "synced today" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps the other metric when Graph rejects one as invalid", async () => {
    const { env, stats } = setup([{ id: "1_a", ageDays: 1 }]);
    const fetcher = graph({
      post_media_view: value(50),
      post_clicks: { error: { code: 100, message: "invalid metric" } },
    });
    await syncFacebookPostStats(env, { now: NOW, fetcher });
    expect(stats()).toEqual([
      { ref: "1_a", day: "2026-10-21", impressions: 50, clicks: null },
    ]);
  });

  it("stops on a permission error, writes NULL rows, and is not asked again today", async () => {
    const { env, stats } = setup([
      { id: "1_a", ageDays: 1 },
      { id: "1_b", ageDays: 2 },
    ]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = graph({
      post_media_view: { error: { code: 200, message: "needs read_insights" } },
    });
    const first = await syncFacebookPostStats(env, { now: NOW, fetcher });
    expect(first).toEqual({
      status: "stopped",
      reason: "Graph error 200",
      posts: 2,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(stats()).toEqual([
      { ref: "1_a", day: "2026-10-21", impressions: null, clicks: null },
      { ref: "1_b", day: "2026-10-21", impressions: null, clicks: null },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    await syncFacebookPostStats(env, { now: NOW + 1000, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("reads only sent posts from the last 28 days, newest first, capped", async () => {
    const many = Array.from(
      { length: FACEBOOK_STATS_MAX_POSTS + 3 },
      (_, i) => ({ id: `1_${i}`, ageDays: i })
    );
    const { env, stats } = setup([
      ...many,
      { id: "1_old", ageDays: 40 },
      { id: "1_failed", ageDays: 0, status: "failed" },
    ]);
    await syncFacebookPostStats(env, {
      now: NOW,
      fetcher: graph({ post_media_view: value(1), post_clicks: value(1) }),
    });
    const refs = stats().map((r) => (r as { ref: string }).ref);
    expect(refs).toHaveLength(FACEBOOK_STATS_MAX_POSTS);
    expect(refs).not.toContain("1_old");
    expect(refs).not.toContain("1_failed");
    expect(refs).toContain("1_0");
  });

  it("does nothing without a Page id and token", async () => {
    const { env } = setup([{ id: "1_a", ageDays: 1 }]);
    const fetcher = graph({});
    const result = await syncFacebookPostStats(
      { DB: env.DB },
      { now: NOW, fetcher }
    );
    expect(result.status).toBe("unconfigured");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
