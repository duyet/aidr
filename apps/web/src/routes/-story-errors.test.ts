/**
 * A story permalink answers 404 only when no published story matches. A
 * failed D1 read is an error: 5xx, never cached, never marked not-found,
 * because a 404 tells crawlers to drop a real story (#904).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ batch: vi.fn(), all: vi.fn() }));
vi.mock("cloudflare:workers", () => ({
  env: {
    DB: {
      batch: db.batch,
      prepare: () => ({ bind: () => ({ all: db.all }) }),
    },
  },
}));
const fetchStory = vi.hoisted(() => vi.fn());
vi.mock("../lib/story-fn", () => ({ fetchStory }));

import { NOT_FOUND_HEADER } from "../lib/not-found-status";
import { Route as PageRoute } from "./$slug";
import { Route as ApiRoute } from "./api/story.$id";

type Get = (args: {
  request: Request;
  params: { id: string };
  context: unknown;
}) => Promise<Response>;
const apiGet = (
  ApiRoute.options as unknown as {
    server: { handlers: { GET: Get } };
  }
).server.handlers.GET;

const ID = "abcdef12";
const d1Down = () => {
  throw new Error("D1_ERROR: Network connection lost.");
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("GET /api/story/<id>", () => {
  const get = () =>
    apiGet({
      request: new Request(`https://aidr.today/api/story/${ID}?lang=en`),
      params: { id: ID },
      context: {},
    });

  it("500s, uncached and without D1 text, when the read fails", async () => {
    db.batch.mockImplementation(d1Down);
    db.all.mockImplementation(d1Down);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get();
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.text()).not.toContain("D1_ERROR");
  });

  it("404s an id with no published or merged story", async () => {
    db.batch.mockResolvedValue([{ results: [] }, { results: [] }]);
    db.all.mockResolvedValue({ results: [] });
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

describe("/<slug> page", () => {
  // An explicit ?lang= is the shareable case that gets the public policy.
  const match = { context: { lang: "en" }, search: { lang: "en" } };
  const headers = PageRoute.options.headers as unknown as HeadersFn;
  const head = PageRoute.options.head as unknown as HeadFn;
  const load = () =>
    (PageRoute.options.loader as unknown as (ctx: unknown) => Promise<unknown>)(
      {
        params: { slug: ID },
        context: { lang: "en" },
        location: { searchStr: "?lang=en", hash: "" },
      }
    );

  it("lets a failed read reach the error boundary instead of 404ing", async () => {
    fetchStory.mockRejectedValue(new Error("story_unavailable"));
    await expect(load()).rejects.toThrow("story_unavailable");
  });

  it("returns missing for a slug with no story", async () => {
    fetchStory.mockResolvedValue(null);
    await expect(load()).resolves.toEqual({ kind: "missing" });
  });

  // TanStack runs headers() and head() with no loaderData when the loader
  // threw. The public story policy there would let a browser keep the 500.
  it("keeps an errored render uncached and unmarked", () => {
    const out = headers({ loaderData: undefined, match });
    expect(out[NOT_FOUND_HEADER]).toBeUndefined();
    expect(out["Cache-Control"]).toBe("private, no-store");
    const title = head({ loaderData: undefined, match }).meta?.find(
      (m) => "title" in m
    )?.title;
    expect(title).not.toMatch(/not found/i);
  });

  it("marks a missing story not-found", () => {
    const out = headers({ loaderData: { kind: "missing" }, match });
    expect(out[NOT_FOUND_HEADER]).toBe("1");
    expect(out["Cache-Control"]).toBe("private, no-store");
  });
});
