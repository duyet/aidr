import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../bugsink.js", () => ({
  reportPipelineException: vi.fn(async () => {}),
  reportHealthAlert: vi.fn(async () => {}),
}));

import {
  evaluateHealth,
  type HealthInput,
  LLM_RATE_LIMIT_BURST,
  LLM_RATE_LIMITED_KEY,
  runHealthCheck,
} from "../health.js";
import { resetOwnerDmRejections } from "../owner-alerts.js";
import type { Env } from "../types.js";

/** 14:00 local, outside the daily-summary and day-video windows. */
const NOW = Date.UTC(2026, 9, 14, 7, 0);
const HOUR = 3600 * 1000;

const healthy: HealthInput = {
  nowMs: NOW,
  localHour: 14,
  steps: [{ name: "tldr", action: "generated" }],
  telegramLastPostMs: { telegram: NOW - HOUR },
  llm: { total: 60, failed: 0, rateLimited: 0 },
  history: [],
};

const keys = (rateLimited: number) =>
  evaluateHealth({ ...healthy, llm: { ...healthy.llm, rateLimited } }).map(
    (i) => i.key
  );

describe("429 burst alert", () => {
  it("fires at the burst size and not below it", () => {
    expect(keys(LLM_RATE_LIMIT_BURST - 1)).toEqual([]);
    expect(keys(LLM_RATE_LIMIT_BURST)).toEqual([LLM_RATE_LIMITED_KEY]);
  });

  it("fires even when the failure rate is under the rate alert's bar", () => {
    const issues = evaluateHealth({
      ...healthy,
      llm: { total: 100, failed: 5, rateLimited: 5 },
    });
    expect(issues.map((i) => i.key)).toEqual([LLM_RATE_LIMITED_KEY]);
  });
});

describe("429 burst alert through the health check", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetOwnerDmRejections();
  });

  function setup(history: { started_at: number; stats: string }[]) {
    const dms: string[] = [];
    const sql: string[] = [];
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
        results: q.includes("FROM workflow_runs") ? history : [],
      }),
      first: async () => ({ total: 40, failed: 40, rate_limited: 37 }),
    });
    const env = {
      DB: {
        prepare: (q: string) => {
          sql.push(q);
          return { ...query(q), bind: () => query(q) };
        },
      },
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_OWNER_CHAT_ID: "12345",
    } as unknown as Env;
    return { env, dms, sql };
  }

  it("DMs the owner once, then stays quiet inside the cooldown", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const first = setup([]);
    const fired = await runHealthCheck(first.env, { runId: "r1", steps: [] });
    expect(fired).toContain(LLM_RATE_LIMITED_KEY);
    expect(first.dms.filter((d) => d.includes("429"))).toHaveLength(1);
    expect(first.sql.some((q) => q.includes("error_status = 429"))).toBe(true);

    const next = setup([
      {
        started_at: Math.floor((NOW - 30 * 60_000) / 1000),
        stats: JSON.stringify({ alerts: fired }),
      },
    ]);
    const again = await runHealthCheck(next.env, { runId: "r2", steps: [] });
    expect(again).not.toContain(LLM_RATE_LIMITED_KEY);
    expect(next.dms.filter((d) => d.includes("429"))).toEqual([]);
  });
});
