import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../bugsink.js", () => ({
  reportPipelineException: vi.fn(async () => {}),
  reportHealthAlert: vi.fn(async () => {}),
}));

import { runHealthCheck } from "../health.js";
import {
  buildTrafficHours,
  CF_ACCOUNT_ID,
  evaluateTraffic,
  fetchTraffic,
  settledHourEnd,
  TRAFFIC_LOW_KEY,
  TRAFFIC_SCRIPT_NAME,
  TRAFFIC_SLOW_KEY,
  type TrafficReport,
  trafficVerdict,
} from "../traffic.js";
import type { Env } from "../types.js";

const HOUR = 3600 * 1000;
/** 07:05 UTC: the 06:00 hour ended 5 minutes ago and has not settled. */
const NOW = Date.UTC(2026, 9, 17, 7, 5);
const END = settledHourEnd(NOW);
const token = ["cf", "analytics", "test"].join("-");

interface Hour {
  requests: number;
  responseP99Ms?: number;
  wallP99Ms?: number;
}

/** Analytics rows for every hour of the fetched range from `pick(hoursAgo)`,
 * where 1 is the newest settled hour. `undefined` leaves the hour out, as
 * the API does for an hour with no invocations. */
function rows(pick: (hoursAgo: number) => Hour | undefined, endMs = END) {
  const out: unknown[] = [];
  for (let ago = 1; ago <= 48 + 7 * 24; ago++) {
    const h = pick(ago);
    if (!h) continue;
    out.push({
      dimensions: {
        datetimeHour: new Date(endMs - ago * HOUR).toISOString(),
        status: "success",
      },
      sum: { requests: h.requests, errors: 0 },
      quantiles: {
        wallTimeP50: 200_000,
        wallTimeP99: (h.wallP99Ms ?? 3000) * 1000,
        requestDurationP99: (h.responseP99Ms ?? 3000) * 1000,
      },
    });
  }
  return out;
}

function stubAnalytics(data: unknown[], status = 200) {
  const fetchMock = vi.fn(async (url: string) => {
    if (!String(url).includes("/graphql")) return new Response("{}");
    return Response.json(
      {
        data: { viewer: { accounts: [{ workersInvocationsAdaptive: data }] } },
      },
      { status }
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function report(
  pick: (hoursAgo: number) => Hour | undefined
): Promise<TrafficReport> {
  stubAnalytics(rows(pick));
  return fetchTraffic({ CF_ANALYTICS_API_TOKEN: token }, NOW);
}

const steady = (): Hour => ({ requests: 1000 });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("traffic constants", () => {
  it("query the Worker and account that wrangler.toml deploys", () => {
    const toml = readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../wrangler.toml"
      ),
      "utf8"
    );
    expect(toml).toMatch(new RegExp(`^name = "${TRAFFIC_SCRIPT_NAME}"$`, "m"));
    expect(toml).toMatch(new RegExp(`^account_id = "${CF_ACCOUNT_ID}"$`, "m"));
  });
});

describe("fetchTraffic", () => {
  it("is unconfigured without a token and never calls the API", async () => {
    const fetchMock = stubAnalytics([]);
    expect(await fetchTraffic({}, NOW)).toEqual({
      status: "unconfigured",
      reason: "CF_ANALYTICS_API_TOKEN unset",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is an error, not zero traffic, when the API refuses the token", async () => {
    stubAnalytics([], 403);
    const result = await fetchTraffic({ CF_ANALYTICS_API_TOKEN: token }, NOW);
    expect(result).toEqual({
      status: "error",
      reason: "analytics API HTTP 403",
    });
    expect(trafficVerdict(result)).toBe("error");
  });

  it("returns 48 settled hours with same-hour 7-day medians", async () => {
    const result = await report((ago) => ({ requests: ago <= 48 ? 500 : 900 }));
    if (result.status !== "ok") throw new Error(result.reason);
    expect(result.hours).toHaveLength(48);
    // The 06:00 hour ended 5 minutes ago: still inside the settle lag.
    expect(result.hours.at(-1)?.hour).toBe("2026-10-17T05:00:00.000Z");
    expect(result.hours.at(-1)?.baseline).toEqual({
      requests: 900,
      responseP99Ms: 3000,
    });
    // The oldest hour's baseline lies wholly before the 48-hour window.
    expect(result.hours[0].baseline.requests).toBe(900);
  });
});

describe("buildTrafficHours", () => {
  it("sums statuses, reads latency from success rows, and takes the same-hour median", () => {
    // `ago` 1 is the newest hour; day k before it is `ago` 1 + 24k.
    const requests = (ago: number) => {
      const day = Math.floor((ago - 1) / 24);
      return day === 7 ? 10_000 : 100 * (day + 1) + (ago % 24);
    };
    const data = [];
    for (let ago = 1; ago <= 48 + 7 * 24; ago++) {
      const datetimeHour = new Date(END - ago * HOUR).toISOString();
      data.push(
        {
          dimensions: { datetimeHour, status: "success" },
          sum: { requests: requests(ago), errors: 0 },
          quantiles: {
            wallTimeP50: 200_000,
            wallTimeP99: 3_000_000,
            requestDurationP99: (2000 + ago) * 1000,
          },
        },
        {
          dimensions: { datetimeHour, status: "clientDisconnected" },
          sum: { requests: 5, errors: 1 },
          quantiles: {
            wallTimeP50: 900_000_000,
            wallTimeP99: 900_000_000,
            requestDurationP99: 900_000_000,
          },
        }
      );
    }
    const newest = buildTrafficHours(data, END).at(-1);
    expect(newest).toMatchObject({
      requests: 101 + 5,
      errors: 1,
      wallP50Ms: 200,
      wallP99Ms: 3000,
      responseP99Ms: 2001,
    });
    // Days 1-7 before: 206, 306, ..., 706 and 10,005; the median is day 4.
    expect(newest?.baseline).toEqual({ requests: 506, responseP99Ms: 2097 });
  });
});

describe("evaluateTraffic", () => {
  it("fires when three settled hours are under 40% of their median", async () => {
    const result = await report((ago) =>
      ago <= 3 ? { requests: 390 } : steady()
    );
    expect(evaluateTraffic(result, new Set()).map((i) => i.key)).toEqual([
      TRAFFIC_LOW_KEY,
    ]);
    expect(trafficVerdict(result)).toBe("low");
  });

  it("stays quiet when only two of the three hours are low", async () => {
    const result = await report((ago) =>
      ago <= 2 ? { requests: 100 } : steady()
    );
    expect(evaluateTraffic(result, new Set())).toEqual([]);
  });

  it("stays quiet at 40% or more", async () => {
    const result = await report((ago) =>
      ago <= 3 ? { requests: 400 } : steady()
    );
    expect(evaluateTraffic(result, new Set())).toEqual([]);
  });

  // An outage leaves no analytics rows at all.
  it("treats settled hours with no rows as zero traffic", async () => {
    const result = await report((ago) => (ago <= 3 ? undefined : steady()));
    expect(evaluateTraffic(result, new Set()).map((i) => i.key)).toEqual([
      TRAFFIC_LOW_KEY,
    ]);
  });

  it("does not read the newest hour while it is inside the settle lag", async () => {
    // Rows end at 06:00, the hour that ended 5 minutes ago; nothing is in
    // yet for it, and the three settled hours before it are normal.
    stubAnalytics(rows(steady, END));
    const result = await fetchTraffic({ CF_ANALYTICS_API_TOKEN: token }, NOW);
    expect(evaluateTraffic(result, new Set())).toEqual([]);
    expect(settledHourEnd(Date.UTC(2026, 9, 17, 7, 11)) - END).toBe(HOUR);
  });

  it("never fires for hours whose median is under the volume floor", async () => {
    const result = await report((ago) =>
      ago <= 3 ? { requests: 0 } : { requests: 290 }
    );
    expect(evaluateTraffic(result, new Set())).toEqual([]);
  });

  it("fires on response p99 over twice its median for three hours", async () => {
    const result = await report((ago) =>
      ago <= 3 ? { requests: 1000, responseP99Ms: 6100 } : steady()
    );
    expect(evaluateTraffic(result, new Set()).map((i) => i.key)).toEqual([
      TRAFFIC_SLOW_KEY,
    ]);
    expect(trafficVerdict(result)).toBe("slow");
  });

  // Wall p99 counts the ingest Workflow's steps (minutes) and waitUntil
  // work; in production it passed 2x its median in 24 of 273 hours.
  it("ignores a wall-time p99 spike when responses stay fast", async () => {
    const result = await report((ago) =>
      ago <= 3 ? { requests: 1000, wallP99Ms: 300_000 } : steady()
    );
    expect(evaluateTraffic(result, new Set())).toEqual([]);
  });

  it("skips a key that already fired in the 24h window", async () => {
    const result = await report((ago) =>
      ago <= 3 ? { requests: 100 } : steady()
    );
    expect(evaluateTraffic(result, new Set([TRAFFIC_LOW_KEY]))).toEqual([]);
  });
});

describe("traffic through the health check", () => {
  function env(history: { started_at: number; stats: string }[]): Env {
    const query = (q: string) => ({
      all: async () => ({
        results: q.includes("FROM workflow_runs")
          ? history.map((run) => ({
              ...run,
              alerts: JSON.stringify(JSON.parse(run.stats).alerts),
            }))
          : [],
      }),
    });
    return {
      DB: { prepare: (q: string) => ({ ...query(q), bind: () => query(q) }) },
      CF_ANALYTICS_API_TOKEN: token,
    } as unknown as Env;
  }

  it("raises traffic-low once per 24h, past the 6h cooldown", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    stubAnalytics(rows((ago) => (ago <= 3 ? { requests: 50 } : steady())));
    const fired = await runHealthCheck(env([]), { runId: "r1", steps: [] });
    expect(fired).toEqual([TRAFFIC_LOW_KEY]);

    const later = await runHealthCheck(
      env([
        {
          started_at: Math.floor((NOW - 8 * HOUR) / 1000),
          stats: JSON.stringify({ alerts: fired }),
        },
      ]),
      { runId: "r2", steps: [] }
    );
    expect(later).toEqual([]);
  });

  it("raises nothing and keeps the other checks when the token is unset", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const noToken = { ...env([]), CF_ANALYTICS_API_TOKEN: undefined } as Env;
    const fired = await runHealthCheck(noToken, {
      runId: "r1",
      steps: [{ name: "fetch", action: "fetch failed" }],
    });
    expect(fired).toEqual(["step-failed"]);
    expect(warn).toHaveBeenCalledWith(
      "health-check traffic skipped: unconfigured (CF_ANALYTICS_API_TOKEN unset)"
    );
    warn.mockRestore();
  });
});
