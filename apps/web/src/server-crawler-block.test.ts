/**
 * Crawlers that robots.txt bans site-wide must not cost a render (#1140).
 */
import handler from "@tanstack/react-start/server-entry";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../worker/types";

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: vi.fn(async () => new Response("<html></html>")) },
}));
vi.mock("../worker/ingest-schedule", () => ({
  ensureIngestAlarm: vi.fn(),
  tickIngest: vi.fn(),
}));
vi.mock("../worker/ingest-scheduler", () => ({
  NewsIngestScheduler: class {},
}));
vi.mock("../worker/workflow", () => ({ NewsIngestWorkflow: class {} }));

const { default: server } = await import("./server");

const env = {} as Env;
const get = (path: string, ua: string) =>
  server.fetch(
    new Request(`https://aidr.today${path}`, {
      headers: { "user-agent": ua, accept: "text/html" },
    }),
    env
  );

describe("robots-banned crawlers", () => {
  it.each([
    "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "Mozilla/5.0 (compatible; DataForSeoBot/1.0; +https://dataforseo.com/dataforseo-bot)",
  ])("get 403 on a story page without a render: %s", async (ua) => {
    const render = vi.mocked(handler.fetch);
    render.mockClear();
    const response = await get("/abcdef12", ua);
    expect(response.status).toBe(403);
    expect(render).not.toHaveBeenCalled();
  });

  it("still serves a normal reader and robots.txt to a banned crawler", async () => {
    const render = vi.mocked(handler.fetch);
    render.mockClear();
    const reader = await get("/abcdef12?lang=en", "Mozilla/5.0 Chrome/130");
    expect(reader.status).toBe(200);
    expect(render).toHaveBeenCalled();
    const robots = await get("/robots.txt", "SemrushBot/7");
    expect(robots.status).toBe(200);
  });
});
