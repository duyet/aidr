/**
 * A week URL answers 404 only when the edition does not exist. A failed D1
 * read is an error: 5xx, never cached, never marked not-found, because a 404
 * tells crawlers to drop a real week (#892).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ batch: vi.fn() }));
vi.mock("cloudflare:workers", () => ({
  env: { DB: { batch: db.batch, prepare: () => ({ bind: () => ({}) }) } },
}));
const fetchWeekEdition = vi.hoisted(() => vi.fn());
vi.mock("../lib/week-fn", () => ({ fetchWeekEdition }));

import { NOT_FOUND_HEADER } from "../lib/not-found-status";
import { Route as ApiRoute } from "./api/week.$week";
import { Route as PageRoute } from "./week.$week";

type Get = (args: {
  request: Request;
  params: { week: string };
}) => Promise<Response>;
const apiGet = (
  ApiRoute.options as unknown as {
    server: { handlers: { GET: Get } };
  }
).server.handlers.GET;

const WEEK = "2026-W41";
const d1Down = () => {
  throw new Error("D1_ERROR: Network connection lost.");
};
const noRows = async () => [{ results: [] }, { results: [] }, { results: [] }];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T03:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("GET /api/week/<week>", () => {
  const get = () =>
    apiGet({
      request: new Request(`https://aidr.today/api/week/${WEEK}`),
      params: { week: WEEK },
    });

  it("500s, uncached, when the D1 read fails", async () => {
    db.batch.mockImplementation(d1Down);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get();
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("404s a closed week that has no edition", async () => {
    db.batch.mockImplementation(noRows);
    expect((await get()).status).toBe(404);
  });
});

type HeadersFn = (ctx: {
  loaderData: unknown;
  match: { context: { lang: string }; search: Record<string, string> };
}) => Record<string, string>;
type HeadFn = (ctx: {
  loaderData: unknown;
  match: { context: { lang: string } };
}) => { meta?: Record<string, string>[] };

describe("/week/<week> page", () => {
  const match = { context: { lang: "en" }, search: { lang: "en" } };
  const headers = PageRoute.options.headers as unknown as HeadersFn;
  const head = PageRoute.options.head as unknown as HeadFn;
  const load = () =>
    (PageRoute.options.loader as unknown as (ctx: unknown) => Promise<unknown>)(
      { params: { week: WEEK }, context: { lang: "en" } }
    );

  it("lets a failed read reach the error boundary instead of 404ing", async () => {
    fetchWeekEdition.mockRejectedValue(new Error("week_unavailable"));
    await expect(load()).rejects.toThrow("week_unavailable");
  });

  it("returns missing for a week with no edition", async () => {
    fetchWeekEdition.mockResolvedValue(null);
    await expect(load()).resolves.toEqual({ kind: "missing", lang: "en" });
  });

  // TanStack runs headers() and head() with no loaderData when the loader
  // threw; the not-found marker there would mislabel the 500.
  it("keeps an errored render uncached and unmarked", () => {
    const out = headers({ loaderData: undefined, match });
    expect(out[NOT_FOUND_HEADER]).toBeUndefined();
    expect(out["Cache-Control"]).toBe("private, no-store");
    const title = head({ loaderData: undefined, match }).meta?.find(
      (m) => "title" in m
    )?.title;
    expect(title).not.toMatch(/not found/i);
  });

  it("marks a missing week not-found", () => {
    const out = headers({
      loaderData: { kind: "missing", lang: "en" },
      match,
    });
    expect(out[NOT_FOUND_HEADER]).toBe("1");
    expect(out["Cache-Control"]).toBe("private, no-store");
  });
});
