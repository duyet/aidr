/**
 * Start serializes a loader error into the page HTML. The day, story and
 * weeks server fns must reject with a generic code, never the D1 text, and
 * must not swallow the failure into a null or empty answer the route would
 * 404 or cache (#904, #905).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      inputValidator: () => builder,
      handler: (fn: (ctx: { data: unknown }) => unknown) => fn,
    };
    return builder;
  },
}));

const D1_TEXT = "D1_ERROR: no such table: items";
const fail = async () => {
  throw new Error(D1_TEXT);
};
vi.mock("cloudflare:workers", () => {
  const stmt = { all: fail, first: fail, raw: fail, run: fail };
  return {
    env: {
      DB: {
        batch: fail,
        prepare: () => ({ ...stmt, bind: () => stmt }),
      },
    },
  };
});

const { fetchDayArchive } = await import("./day-archive-fn");
const { fetchStory } = await import("./story-fn");
const { fetchWeekIndex } = await import("./week-fn");

type Fn = (ctx: { data: unknown }) => Promise<unknown>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  ["fetchDayArchive", fetchDayArchive, { date: "2026-08-01" }, "day"],
  ["fetchStory", fetchStory, { idPrefix: "abcdef12" }, "story"],
  ["fetchWeekIndex", fetchWeekIndex, undefined, "weeks"],
])("%s on a D1 error", (_name, fn, data, code) => {
  it(`rejects with ${code}_unavailable and no D1 text`, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = await (fn as unknown as Fn)({ data }).then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(`${code}_unavailable`);
    expect((error as Error).message).not.toContain("D1_ERROR");
  });
});
