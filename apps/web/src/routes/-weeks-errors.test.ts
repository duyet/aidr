/**
 * `/weeks` with an explicit `?lang=` is edge-cached for 30 minutes. A failed
 * D1 read must answer 5xx, uncached, instead of a cacheable empty index that
 * tells readers no issue exists yet (#905).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchWeekIndex = vi.hoisted(() => vi.fn());
vi.mock("../lib/week-fn", () => ({ fetchWeekIndex }));

import { NOT_FOUND_HEADER } from "../lib/not-found-status";
import { Route } from "./weeks";

type HeadersFn = (ctx: {
  loaderData: unknown;
  match: { context: { lang: string }; search: Record<string, string> };
}) => Record<string, string>;
type HeadFn = (ctx: {
  loaderData: unknown;
  match: { context: { lang: string } };
}) => { meta?: Record<string, string>[] };

const match = { context: { lang: "en" }, search: { lang: "en" } };
const headers = Route.options.headers as unknown as HeadersFn;
const head = Route.options.head as unknown as HeadFn;
const load = () =>
  (Route.options.loader as unknown as (ctx: unknown) => Promise<unknown>)({
    context: { lang: "en" },
  });

afterEach(() => {
  vi.clearAllMocks();
});

describe("/weeks page", () => {
  it("lets a failed read reach the error boundary", async () => {
    fetchWeekIndex.mockRejectedValue(new Error("weeks_unavailable"));
    await expect(load()).rejects.toThrow("weeks_unavailable");
  });

  it("keeps an errored render uncached, unmarked and unindexed", () => {
    const out = headers({ loaderData: undefined, match });
    expect(out["Cache-Control"]).toBe("private, no-store");
    expect(out[NOT_FOUND_HEADER]).toBeUndefined();
    const meta = head({ loaderData: undefined, match }).meta ?? [];
    expect(meta.find((m) => "title" in m)?.title).toMatch(/unavailable/i);
    expect(meta.find((m) => m.name === "robots")?.content).toMatch(/noindex/);
  });

  // Before the first issue the empty index is the real answer and stays
  // cacheable; only a failed read is uncached.
  it("still edge-caches a successful empty index", () => {
    const out = headers({ loaderData: { weeks: [] }, match });
    expect(out["Cache-Control"]).toContain("s-maxage=1800");
  });
});
