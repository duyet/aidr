/**
 * A day URL answers 404 only when the day has nothing stored. A failed D1
 * read is an error: 5xx, never cached, never marked not-found, because a 404
 * tells crawlers to drop a real day (#904).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchDayArchive = vi.hoisted(() => vi.fn());
vi.mock("../lib/day-archive-fn", () => ({ fetchDayArchive }));

import { NOT_FOUND_HEADER } from "../lib/not-found-status";
import { Route } from "./date.$date";

type HeadersFn = (ctx: {
  loaderData: unknown;
  match: { context: { lang: string }; search: Record<string, string> };
}) => Record<string, string>;
type HeadFn = (ctx: {
  loaderData: unknown;
  match: { context: { lang: string } };
}) => { meta?: Record<string, string>[] };

const DATE = "2026-08-01";
const match = { context: { lang: "en" }, search: { lang: "en" } };
const headers = Route.options.headers as unknown as HeadersFn;
const head = Route.options.head as unknown as HeadFn;
const load = () =>
  (Route.options.loader as unknown as (ctx: unknown) => Promise<unknown>)({
    params: { date: DATE },
    context: { lang: "en" },
  });

afterEach(() => {
  vi.clearAllMocks();
});

describe("/date/<date> page", () => {
  it("lets a failed read reach the error boundary instead of 404ing", async () => {
    fetchDayArchive.mockRejectedValue(new Error("day_unavailable"));
    await expect(load()).rejects.toThrow("day_unavailable");
  });

  it("returns missing for a day with nothing stored", async () => {
    fetchDayArchive.mockResolvedValue({
      date: DATE,
      day: null,
      tldr: null,
      prevDate: null,
      nextDate: null,
      week: null,
      videos: { en: null, vi: null },
    });
    await expect(load()).resolves.toEqual({ kind: "missing", lang: "en" });
  });

  // TanStack runs headers() and head() with no loaderData when the loader
  // threw; the not-found marker there would turn the 500 into a 404.
  it("keeps an errored render uncached and unmarked", () => {
    const out = headers({ loaderData: undefined, match });
    expect(out[NOT_FOUND_HEADER]).toBeUndefined();
    expect(out["Cache-Control"]).toBe("private, no-store");
    const title = head({ loaderData: undefined, match }).meta?.find(
      (m) => "title" in m
    )?.title;
    expect(title).toMatch(/unavailable/i);
  });

  it("marks a missing day not-found", () => {
    const out = headers({
      loaderData: { kind: "missing", lang: "en" },
      match,
    });
    expect(out[NOT_FOUND_HEADER]).toBe("1");
    expect(out["Cache-Control"]).toBe("private, no-store");
    const title = head({
      loaderData: { kind: "missing", lang: "en" },
      match,
    }).meta?.find((m) => "title" in m)?.title;
    expect(title).toMatch(/not found/i);
  });
});
