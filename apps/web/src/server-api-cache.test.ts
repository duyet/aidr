/**
 * An API route's own Cache-Control must survive the Worker's response
 * wrappers. `withRouteIndexabilityHeaders` stamps `private, no-store` on every
 * `/api/*` path it does not allowlist, which silently turned the day-long
 * public thumb policy into an uncacheable response (issue #891).
 */
import handler from "@tanstack/react-start/server-entry";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../worker/types";

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: vi.fn() },
}));
vi.mock("../worker/ingest-schedule", () => ({
  ensureIngestAlarm: vi.fn(),
  tickIngest: vi.fn(),
}));
vi.mock("../worker/ingest-scheduler", () => ({
  NewsIngestScheduler: class {},
}));
vi.mock("../worker/workflow", () => ({
  NewsIngestWorkflow: class {},
}));

const { default: server } = await import("./server");

const THUMB_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";
const ITEM_ID = "ab".repeat(32);
const THUMB_PATH = `/api/thumb/${ITEM_ID}?u=${encodeURIComponent(
  "https://cdn.example.com/hero.png"
)}`;

async function fetchPath(path: string): Promise<Response> {
  return server.fetch(
    new Request(`https://aidr.today${path}`, {
      headers: { Accept: "image/webp,*/*" },
    }),
    {} as Env
  );
}

beforeEach(() => {
  vi.mocked(handler.fetch).mockReset();
  vi.mocked(handler.fetch).mockImplementation(
    async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": THUMB_CACHE_CONTROL,
        },
      })
  );
});

describe("/api/thumb through the Worker response chain", () => {
  it("keeps the route's public Cache-Control", async () => {
    const response = await fetchPath(THUMB_PATH);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(THUMB_CACHE_CONTROL);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
  });

  it("turns private when the query carries a credential-shaped key", async () => {
    const response = await fetchPath(`${THUMB_PATH}&token=abc`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("an /api path outside the public allowlist", () => {
  it("is private even when the handler answers public", async () => {
    const response = await fetchPath("/api/not-allowlisted");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
