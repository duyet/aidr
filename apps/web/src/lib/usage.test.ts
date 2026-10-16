import { describe, expect, it, vi } from "vitest";
import {
  classifyRequest,
  clientBucket,
  recordRequestUsage,
  recordUsage,
  templateRoute,
} from "./usage";

const event = {
  surface: "api",
  route: "/api/public",
  status: 200,
  client: "other",
} as const;

describe("templateRoute", () => {
  it("strips ids, dates and weeks from paths", () => {
    expect(templateRoute("/api/story/0123abcd4567.md")).toBe(
      "/api/story/:id.md"
    );
    expect(templateRoute("/date/2026-10-16.md")).toBe("/date/:date.md");
    expect(templateRoute("/week/2026-W42.md")).toBe("/week/:week.md");
    expect(templateRoute("/0123abcd.md")).toBe("/:id.md");
  });

  it("never carries a query string into the route", () => {
    const request = new Request(
      "https://aidr.today/api/public?lang=vi&q=secret"
    );
    const hit = classifyRequest(new URL(request.url).pathname);
    expect(hit?.route).toBe("/api/public");
  });

  it("drops paths outside the allowlist so scanners cannot grow the dataset", () => {
    expect(classifyRequest("/api/admin/ingest")).toBeNull();
    expect(classifyRequest("/api/story/zzzz")).toBeNull();
  });
});

describe("clientBucket", () => {
  it.each([
    ["Claude-User/1.0", "mcp-client"],
    ["Cursor/0.45 mcp", "mcp-client"],
    ["Feedly/1.0 (+http://www.feedly.com/fetcher.html)", "feed-reader"],
    ["NetNewsWire (RSS Reader; https://netnewswire.com/)", "feed-reader"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1)", "bot"],
    ["Mozilla/5.0 (Macintosh) AppleWebKit/605 Safari/605", "browser"],
    ["curl/8.5.0", "other"],
    [null, "other"],
  ])("%s -> %s", (ua, bucket) => {
    expect(clientBucket(ua)).toBe(bucket);
  });
});

describe("recordUsage", () => {
  it("is a no-op without the binding", () => {
    expect(() => recordUsage({}, event)).not.toThrow();
    expect(() => recordUsage(undefined, event)).not.toThrow();
  });

  it("never throws when writeDataPoint throws", () => {
    const USAGE = {
      writeDataPoint: vi.fn(() => {
        throw new Error("analytics down");
      }),
    };
    expect(() => recordUsage({ USAGE }, event)).not.toThrow();
    expect(USAGE.writeDataPoint).toHaveBeenCalledOnce();
  });

  it("writes surface, route, tool, client, count and status", () => {
    const USAGE = { writeDataPoint: vi.fn() };
    recordUsage({ USAGE }, { ...event, surface: "mcp", tool: "search_news" });
    expect(USAGE.writeDataPoint).toHaveBeenCalledWith({
      blobs: ["mcp", "/api/public", "search_news", "other"],
      doubles: [1, 200],
      indexes: ["mcp"],
    });
  });
});

describe("recordRequestUsage", () => {
  it("stores no user agent, ip or query in the data point", () => {
    const USAGE = { writeDataPoint: vi.fn() };
    const request = new Request("https://aidr.today/feed.xml?token=abc", {
      headers: {
        "User-Agent": "Feedly/1.0 secret-build-9",
        "CF-Connecting-IP": "203.0.113.9",
      },
    });
    recordRequestUsage({ USAGE }, request, new Response("", { status: 200 }));
    const point = JSON.stringify(USAGE.writeDataPoint.mock.calls[0]);
    expect(point).not.toMatch(/secret-build|203\.0\.113|token|abc/);
    expect(USAGE.writeDataPoint.mock.calls[0]?.[0].blobs).toEqual([
      "rss",
      "/feed.xml",
      "",
      "feed-reader",
    ]);
  });
});
