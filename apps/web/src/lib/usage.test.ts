import { describe, expect, it, vi } from "vitest";
import {
  classifyClient,
  classifyRequest,
  clientBucket,
  parseClientHeader,
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

  it("tracks the iOS thumbnail route under one template", () => {
    const id = "a".repeat(64);
    expect(classifyRequest(`/api/thumb/${id}`)).toEqual({
      surface: "api",
      route: "/api/thumb/:id",
    });
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

describe("parseClientHeader", () => {
  it.each([
    ["ios/0.1.0+12", "ios-app", "0.1.0+12"],
    ["ios/0.0.0-verify", "ios-app", "0.0.0-verify"],
    ["extension/1.4.2", "chrome-extension", "1.4.2"],
    ["extension/0.1", "chrome-extension", "0.1"],
    ["extension/1.2.3.4", "chrome-extension", "1.2.3.4"],
  ])("%s -> %s %s", (value, client, appVersion) => {
    expect(parseClientHeader(value)).toEqual({ client, appVersion });
  });

  // The version becomes a dataset blob: only a short semver-like value may
  // reach it, and an app name outside the closed set counts as nothing.
  it.each([
    null,
    "",
    "ios",
    "ios/",
    "/1.0.0",
    "android/1.0.0",
    "IOS/1.0.0",
    "toString/1.0.0",
    "__proto__/1.0.0",
    "ios/1",
    "ios/1.0.0.0.0",
    "ios/123456.0.0",
    "ios/v1.0.0",
    "ios/1.0.0+",
    "ios/1.0.0+12345678",
    `ios/1.0.0-${"a".repeat(13)}`,
    "ios/1.0.0 (build 1)",
    "ios/1.0.0\n",
    "ios/<script>",
    "ios/".padEnd(500, "9"),
  ])("rejects %j", (value) => {
    expect(parseClientHeader(value)).toBeNull();
  });
});

describe("classifyClient", () => {
  const classify = (init: Record<string, string>) =>
    classifyClient(new Headers(init));

  it("counts our iOS app by its header, whatever the User-Agent says", () => {
    expect(
      classify({
        "X-AIDR-Client": "ios/0.1.0+12",
        "User-Agent": "AIDR-iOS/0.1.0 (build 12; iOS 26.5)",
      })
    ).toEqual({ client: "ios-app", appVersion: "0.1.0+12" });
    expect(
      classify({ "x-aidr-client": "ios/0.1.0+12", "User-Agent": "curl/8" })
    ).toEqual({ client: "ios-app", appVersion: "0.1.0+12" });
  });

  it("counts the Chrome extension by its header, with its version", () => {
    expect(classify({ "X-AIDR-Client": "extension/2.0.1" })).toEqual({
      client: "chrome-extension",
      appVersion: "2.0.1",
    });
  });

  it("counts a chrome-extension:// origin without a header, with no version", () => {
    expect(classify({ Origin: "chrome-extension://abcdefghijklmnop" })).toEqual(
      { client: "chrome-extension", appVersion: "" }
    );
  });

  it("lets the header outrank the origin and the fetch site", () => {
    expect(
      classify({
        "X-AIDR-Client": "ios/1.0.0",
        Origin: "chrome-extension://abc",
        "Sec-Fetch-Site": "same-origin",
      }).client
    ).toBe("ios-app");
  });

  it("counts same-origin pages of aidr.today as web", () => {
    const web = { client: "web", appVersion: "" };
    expect(classify({ "Sec-Fetch-Site": "same-origin" })).toEqual(web);
    expect(classify({ Origin: "https://aidr.today" })).toEqual(web);
    expect(
      classify({
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": "Mozilla/5.0 (Macintosh) Safari/605",
      })
    ).toEqual(web);
  });

  it("does not count another site's browser as web", () => {
    expect(
      classify({
        Origin: "https://evil.example",
        "Sec-Fetch-Site": "cross-site",
        "User-Agent": "Mozilla/5.0 (Macintosh) Safari/605",
      })
    ).toEqual({ client: "browser", appVersion: "" });
    expect(classify({ Origin: "https://aidr.today.evil.example" }).client).toBe(
      "other"
    );
  });

  it("falls through to the User-Agent buckets without an identity", () => {
    expect(classify({ "User-Agent": "Feedly/1.0" }).client).toBe("feed-reader");
    expect(classify({ "User-Agent": "Claude-User/1.0" }).client).toBe(
      "mcp-client"
    );
    expect(classify({}).client).toBe("other");
  });

  it("ignores spoofed or garbage header values and keeps no version", () => {
    for (const value of [
      "android/9.9.9",
      "ios/not-a-version",
      "ios/1.0.0; DROP TABLE",
      `ios/${"1".repeat(300)}`,
    ]) {
      expect(
        classify({ "X-AIDR-Client": value, "User-Agent": "curl/8.5.0" })
      ).toEqual({ client: "other", appVersion: "" });
    }
    expect(
      classify({
        "X-AIDR-Client": "ios/garbage",
        Origin: "chrome-extension://abc",
      })
    ).toEqual({ client: "chrome-extension", appVersion: "" });
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
      blobs: ["mcp", "/api/public", "search_news", "other", ""],
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
      "",
    ]);
  });

  it("writes the app version as the trailing blob for our apps only", () => {
    const USAGE = { writeDataPoint: vi.fn() };
    const get = (headers: Record<string, string>) =>
      new Request("https://aidr.today/api/feed?days=1", { headers });
    recordRequestUsage(
      { USAGE },
      get({ "X-AIDR-Client": "ios/0.1.0+12", "User-Agent": "AIDR-iOS/0.1.0" }),
      new Response("{}")
    );
    recordRequestUsage(
      { USAGE },
      get({ "X-AIDR-Client": "extension/1.2.3" }),
      new Response("{}")
    );
    recordRequestUsage(
      { USAGE },
      get({ "User-Agent": "curl/8" }),
      new Response("{}")
    );
    const blobs = USAGE.writeDataPoint.mock.calls.map((c) => c[0].blobs);
    expect(blobs).toEqual([
      ["api", "/api/feed", "", "ios-app", "0.1.0+12"],
      ["api", "/api/feed", "", "chrome-extension", "1.2.3"],
      ["api", "/api/feed", "", "other", ""],
    ]);
    expect(JSON.stringify(blobs)).not.toContain("AIDR-iOS");
  });

  // Production answers text/markdown on a 404 for any `.md` path, so the
  // negotiated fallback used to write the raw path into the dataset.
  it("writes nothing for an unknown path that answers text/markdown", () => {
    const USAGE = { writeDataPoint: vi.fn() };
    const markdown404 = () =>
      new Response("not found", {
        status: 404,
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    for (const path of [
      "/api/story/zzzz-secret.md",
      "/date/2026-10-16x.md",
      "/week/foo.md",
      "/wp-admin/anything",
    ]) {
      recordRequestUsage(
        { USAGE },
        new Request(`https://aidr.today${path}`),
        markdown404()
      );
    }
    expect(USAGE.writeDataPoint).not.toHaveBeenCalled();
  });

  it("counts a negotiated page under its template", () => {
    const USAGE = { writeDataPoint: vi.fn() };
    recordRequestUsage(
      { USAGE },
      new Request("https://aidr.today/date/2026-10-16"),
      new Response("# day", {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      })
    );
    expect(USAGE.writeDataPoint.mock.calls[0]?.[0].blobs[1]).toBe(
      "/date/:date"
    );
  });
});
