import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_DAILY_SQL,
  CLIENT_VERSIONS_SQL,
  fetchClientUsage,
} from "../client-usage.js";

const token = ["cf", "analytics", "test"].join("-");

const DAILY = [
  { day: "2026-11-28", client: "ios-app", hits: "12" },
  { day: "2026-11-28", client: "chrome-extension", hits: 7 },
  { day: "2026-11-27", client: "web", hits: 40 },
];
const VERSIONS = [
  {
    client: "ios-app",
    version: "0.1.0+12",
    hits: "12",
    last_seen: "2026-11-28 12:30:01",
  },
];

function stubSql(
  rows: { daily?: unknown; versions?: unknown } = {},
  status = 200
) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    if (status !== 200) return new Response("denied", { status });
    const data = String(init.body).includes("blob5 != ''")
      ? (rows.versions ?? VERSIONS)
      : (rows.daily ?? DAILY);
    return Response.json({ data });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchClientUsage", () => {
  it("is unconfigured, never zeros, without the token", async () => {
    expect(await fetchClientUsage({})).toEqual({
      status: "unconfigured",
      reason: "CF_ANALYTICS_API_TOKEN unset",
    });
  });

  it("returns per-day client hits and app versions", async () => {
    const fetchMock = stubSql();
    const report = await fetchClientUsage({ CF_ANALYTICS_API_TOKEN: token });
    expect(report).toEqual({
      status: "ok",
      windowDays: 7,
      daily: [
        { day: "2026-11-28", client: "ios-app", hits: 12 },
        { day: "2026-11-28", client: "chrome-extension", hits: 7 },
        { day: "2026-11-27", client: "web", hits: 40 },
      ],
      versions: [
        {
          client: "ios-app",
          version: "0.1.0+12",
          hits: 12,
          lastSeen: "2026-11-28T12:30:01.000Z",
        },
      ],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/accounts\/[0-9a-f]{32}\/analytics_engine\/sql$/);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Bearer ${token}`
    );
    expect(fetchMock.mock.calls.map((c) => c[1].body)).toEqual([
      CLIENT_DAILY_SQL,
      CLIENT_VERSIONS_SQL,
    ]);
  });

  it("reports a refusal without the token or the response body", async () => {
    stubSql({}, 403);
    const report = await fetchClientUsage({ CF_ANALYTICS_API_TOKEN: token });
    expect(report.status).toBe("error");
    expect(JSON.stringify(report)).not.toContain(token);
  });

  it("fails the whole read on a row it cannot parse", async () => {
    stubSql({ daily: [{ day: "2026-11-28", client: "web", hits: "many" }] });
    const report = await fetchClientUsage({ CF_ANALYTICS_API_TOKEN: token });
    expect(report).toEqual({
      status: "error",
      reason: "analytics SQL API: unexpected shape",
    });
  });

  it("turns a network failure into a status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );
    const report = await fetchClientUsage({ CF_ANALYTICS_API_TOKEN: token });
    expect(report.status).toBe("error");
  });
});
