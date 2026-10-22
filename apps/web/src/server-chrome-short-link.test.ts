import { describe, expect, it, vi } from "vitest";
import type { Env } from "../worker/types";
import { CHROME_SHORT_URL, CHROME_WEB_STORE_URL } from "./lib/site";

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

const tagged = (source: string) =>
  `${CHROME_WEB_STORE_URL}?utm_source=${source}&utm_medium=short_link&utm_campaign=chrome_extension`;

async function get(url: string): Promise<Response> {
  return server.fetch(
    new Request(url, { headers: { Accept: "text/html" } }),
    {} as Env
  );
}

describe("aidr.today/c short link", () => {
  it("302s to the store listing tagged as video traffic by default", async () => {
    const res = await get(CHROME_SHORT_URL);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(tagged("video"));
  });

  it("passes ?s= through as utm_source so each placement is counted apart", async () => {
    const res = await get(`${CHROME_SHORT_URL}?s=YouTube`);
    expect(res.headers.get("Location")).toBe(tagged("youtube"));
  });

  it("falls back to video when ?s= is not a safe slug", async () => {
    const res = await get(
      `${CHROME_SHORT_URL}?s=${encodeURIComponent("<x y>")}`
    );
    expect(res.headers.get("Location")).toBe(tagged("video"));
  });
});
