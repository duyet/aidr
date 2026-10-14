import { describe, expect, it, vi } from "vitest";
import type { DayArchive } from "../lib/feed-queries";

vi.mock("@cf-wasm/og/workerd", () => ({
  cache: { setExecutionContext: () => {} },
  ImageResponse: {
    async: async () =>
      new Response("fake-png", {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
  },
}));

vi.mock("../lib/db", () => ({ readSession: (db: unknown) => db }));

vi.mock("../lib/feed-queries", () => ({
  getDayArchive: vi.fn(async () => currentArchive),
}));

const { Route } = await import("./api/og.date.$date");

/** A day page that exists but has no published stories yet. */
let currentArchive = {
  date: "2026-10-03",
  day: null,
  tldr: null,
  videos: { en: null, vi: null },
  prev: null,
  next: null,
} as unknown as DayArchive;

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

function call(path: string, date: string): Promise<Response> {
  return get({
    request: new Request(`https://aidr.today${path}`),
    context: { cloudflare: { env: { DB: FAKE_DB } } },
    params: { date },
  });
}

describe("api/og/date/$date with no stories on the day", () => {
  it("redirects a valid day's card to the site image, uncached, until a story publishes", async () => {
    for (const lang of ["en", "vi"]) {
      const res = await call(
        `/api/og/date/2026-10-03.png?lang=${lang}`,
        "2026-10-03.png"
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        "https://aidr.today/og-home.jpg"
      );
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("still 404s a future date", async () => {
    const res = await call(
      "/api/og/date/2999-01-01.png?lang=en",
      "2999-01-01.png"
    );
    expect(res.status).toBe(404);
  });

  it("still 404s a date that does not exist on the calendar", async () => {
    const res = await call(
      "/api/og/date/2026-02-30.png?lang=en",
      "2026-02-30.png"
    );
    expect(res.status).toBe(404);
  });

  it("renders the card once the day has a story with copy in that lang", async () => {
    currentArchive = {
      ...currentArchive,
      day: {
        date: "2026-10-03",
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
    const res = await call(
      "/api/og/date/2026-10-03.png?lang=en",
      "2026-10-03.png"
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });
});
