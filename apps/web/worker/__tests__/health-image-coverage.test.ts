import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../bugsink.js", () => ({
  reportPipelineException: vi.fn(async () => {}),
  reportHealthAlert: vi.fn(async () => {}),
}));

import { runHealthCheck } from "../health.js";
import { resetOwnerDmRejections } from "../owner-alerts.js";
import type { Env } from "../types.js";

/** 14:00 local, outside the daily-summary and day-video windows. */
const NOW = Date.UTC(2026, 9, 14, 7, 0);
const HOUR = 3600 * 1000;
const KEY = "image-coverage:marketbrief";

const COVERAGE = [
  {
    source: "marketbrief",
    items24h: 20,
    usable24h: 1,
    items7d: 140,
    usable7d: 135,
  },
  { source: "hf-papers", items24h: 8, usable24h: 0, items7d: 32, usable7d: 17 },
  {
    source: "arxiv-research",
    items24h: 6,
    usable24h: 0,
    items7d: 24,
    usable7d: 9,
  },
];

describe("image coverage through the health check", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetOwnerDmRejections();
  });

  function setup(history: { started_at: number; stats: string }[]) {
    const dms: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("api.telegram.org")) {
          dms.push(JSON.parse(String(init?.body)).text);
        }
        return new Response("{}", { status: 200 });
      })
    );
    const query = (q: string) => ({
      all: async () => ({
        results: q.includes("json_each")
          ? COVERAGE
          : q.includes("FROM workflow_runs")
            ? history.map((run) => ({
                ...run,
                alerts: JSON.stringify(JSON.parse(run.stats).alerts),
              }))
            : [],
      }),
    });
    const env = {
      DB: {
        prepare: (q: string) => ({ ...query(q), bind: () => query(q) }),
      },
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_OWNER_CHAT_ID: "12345",
    } as unknown as Env;
    return { env, dms };
  }

  it("DMs once for the collapsed source only, then not on later runs", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const first = setup([]);
    const fired = await runHealthCheck(first.env, { runId: "r1", steps: [] });
    expect(fired).toEqual([KEY]);
    const dm = first.dms.filter((d) => d.includes("image coverage"));
    expect(dm).toHaveLength(1);
    expect(dm[0]).toContain("marketbrief");
    expect(dm[0]).not.toContain("hf-papers");
    expect(dm[0]).not.toContain("arxiv-research");

    // 30 min later: inside the 6h cooldown.
    const soon = setup([
      {
        started_at: Math.floor((NOW - 30 * 60_000) / 1000),
        stats: JSON.stringify({ alerts: fired }),
      },
    ]);
    expect(await runHealthCheck(soon.env, { runId: "r2", steps: [] })).toEqual(
      []
    );
    expect(soon.dms).toEqual([]);

    // 8h later: past the 6h cooldown, still inside the 24h window the
    // collapse is measured over, so the same collapse stays quiet.
    const later = setup([
      {
        started_at: Math.floor((NOW - 8 * HOUR) / 1000),
        stats: JSON.stringify({ alerts: fired }),
      },
    ]);
    expect(await runHealthCheck(later.env, { runId: "r3", steps: [] })).toEqual(
      []
    );
    expect(later.dms).toEqual([]);
  });
});
