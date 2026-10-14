import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayArchive } from "../lib/feed-queries";

vi.mock("@cf-wasm/og/workerd", () => ({
  cache: { setExecutionContext: () => {} },
  ImageResponse: {
    async: async (_element: unknown, options: { headers?: HeadersInit }) =>
      new Response("fake-png", {
        status: 200,
        headers: { ...options.headers, "content-type": "image/png" },
      }),
  },
}));

vi.mock("../lib/db", () => ({ readSession: (db: unknown) => db }));

vi.mock("../lib/feed-queries", () => ({
  getDayArchive: vi.fn(async () => currentArchive),
}));

const { Route } = await import("./api/og.date.$date");

/** 10:00 on 2026-10-15 in the audience zone (UTC+7). */
const NOW = new Date("2026-10-15T03:00:00Z");

function emptyArchive(date: string): DayArchive {
  return {
    date,
    day: null,
    tldr: null,
    videos: { en: null, vi: null },
    prev: null,
    next: null,
  } as unknown as DayArchive;
}

let currentArchive = emptyArchive("2026-10-15");

type Handler = (args: {
  request: Request;
  context: unknown;
  params: { date: string };
}) => Promise<Response>;

const get: Handler = (
  Route as unknown as {
    options: { server: { handlers: { GET: Handler } } };
  }
).options.server.handlers.GET;

const FAKE_DB = { prepare: () => ({}) } as unknown as D1Database;

let r2: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };
let edge: { match: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  r2 = { get: vi.fn(async () => null), put: vi.fn(async () => undefined) };
  edge = {
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
  };
  vi.stubGlobal("caches", { default: edge });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function call(date: string, lang = "en"): Promise<Response> {
  return get({
    request: new Request(
      `https://aidr.today/api/og/date/${date}.png?lang=${lang}`
    ),
    context: { cloudflare: { env: { DB: FAKE_DB, OG_CACHE: r2 } } },
    params: { date: `${date}.png` },
  });
}

describe("api/og/date/$date for a day with no stories", () => {
  it("serves today's card as a PNG, briefly cached and never stored, so the first stories show up within minutes", async () => {
    currentArchive = emptyArchive("2026-10-15");
    for (const lang of ["en", "vi"]) {
      const res = await call("2026-10-15", lang);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
      expect(res.headers.get("Location")).toBeNull();
    }
    expect(r2.put).not.toHaveBeenCalled();
    expect(edge.put).not.toHaveBeenCalled();
  });

  it("does not store an empty card for a recent day that is not settled yet", async () => {
    currentArchive = emptyArchive("2026-10-14");
    const res = await call("2026-10-14");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(r2.put).not.toHaveBeenCalled();
    expect(edge.put).not.toHaveBeenCalled();
  });

  it("caches a settled empty day like any settled card", async () => {
    currentArchive = emptyArchive("2026-01-01");
    const res = await call("2026-01-01", "vi");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=43200"
    );
    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(edge.put).toHaveBeenCalledTimes(1);
  });

  it("404s a future date", async () => {
    const res = await call("2026-10-16");
    expect(res.status).toBe(404);
  });

  it("404s a date that does not exist on the calendar", async () => {
    const res = await call("2026-02-30");
    expect(res.status).toBe(404);
  });
});

describe("api/og/date/$date for a day with stories", () => {
  it("renders and stores today's card once a story has copy in that lang", async () => {
    currentArchive = {
      ...emptyArchive("2026-10-15"),
      day: {
        date: "2026-10-15",
        items: [
          {
            id: "a1b2c3d4e5f60718",
            title: "A story",
            summary: "Some copy",
            title_vi: null,
            summary_vi: null,
            image_url: null,
            tags: ["ai"],
            category: "ai",
          },
        ],
      },
    } as unknown as DayArchive;
    const res = await call("2026-10-15");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=600, s-maxage=3600, stale-while-revalidate=3600"
    );
    expect(r2.put).toHaveBeenCalledTimes(1);
    expect(edge.put).toHaveBeenCalledTimes(1);
  });
});
