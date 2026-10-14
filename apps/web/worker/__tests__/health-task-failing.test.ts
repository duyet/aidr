import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../bugsink.js", () => ({
  reportPipelineException: vi.fn(async () => {}),
  reportHealthAlert: vi.fn(async () => {}),
}));

import {
  evaluateHealth,
  type HealthInput,
  LLM_TASK_FAILING_MIN_ATTEMPTS,
  type LlmTaskCount,
  llmTaskFailingKey,
  runHealthCheck,
} from "../health.js";
import { resetOwnerDmRejections } from "../owner-alerts.js";
import type { Env } from "../types.js";

/** 14:00 local, outside the daily-summary and day-video windows. */
const NOW = Date.UTC(2026, 9, 14, 7, 0);
const HOUR = 3600 * 1000;
const REVIEW_CHAIN = ["z-ai/glm-4.6", "stealth/space-bunny-alpha"];

const ok = (task: string, n: number): LlmTaskCount => ({
  task,
  total: n,
  ok: n,
  rateLimited: 0,
  models: ["google/gemini-3-flash"],
});

const review = (total: number, okCount = 0, rateLimited = 0): LlmTaskCount => ({
  task: "review",
  total,
  ok: okCount,
  rateLimited,
  models: REVIEW_CHAIN,
});

function input(tasks: LlmTaskCount[]): HealthInput {
  const total = tasks.reduce((n, t) => n + t.total, 0);
  const okCount = tasks.reduce((n, t) => n + t.ok, 0);
  return {
    nowMs: NOW,
    localHour: 14,
    steps: [{ name: "tldr", action: "generated" }],
    telegramLastPostMs: { telegram: NOW - HOUR },
    llm: {
      total,
      failed: total - okCount,
      rateLimited: tasks.reduce((n, t) => n + t.rateLimited, 0),
      tasks,
    },
    history: [],
  };
}

const keys = (tasks: LlmTaskCount[]) =>
  evaluateHealth(input(tasks)).map((i) => i.key);

describe("whole-chain task failure alert", () => {
  // Run a3816eaf (#655): 8 of 31 attempts failed, all of them review. The
  // run-wide rate alert stayed quiet while no translation got reviewed.
  it("fires when every attempt of one task failed, under the run-wide rate bar", () => {
    const issues = evaluateHealth(
      input([ok("score", 12), ok("translate", 8), ok("tldr", 3), review(8)])
    );
    expect(issues.map((i) => i.key)).toEqual([llmTaskFailingKey("review")]);
    expect(issues[0]?.detail).toContain("8");
    for (const model of REVIEW_CHAIN)
      expect(issues[0]?.detail).toContain(model);
  });

  it("needs the minimum number of attempts", () => {
    const min = LLM_TASK_FAILING_MIN_ATTEMPTS;
    expect(keys([ok("score", 20), review(min - 1)])).toEqual([]);
    expect(keys([ok("score", 20), review(min)])).toEqual([
      llmTaskFailingKey("review"),
    ]);
  });

  it("stays quiet when one attempt of the task succeeded", () => {
    expect(keys([ok("score", 20), review(6, 1)])).toEqual([]);
  });

  // A 429 burst already has its own alert; counting those attempts here
  // would page once per task for the same spent quota.
  it("leaves rate-limited attempts to the 429 alert", () => {
    expect(keys([ok("score", 40), review(4, 0, 4)])).toEqual([]);
    expect(keys([ok("score", 40), review(5, 0, 2)])).toEqual([
      llmTaskFailingKey("review"),
    ]);
  });

  it("raises one key per failing task", () => {
    expect(
      keys([ok("score", 20), { ...review(3), task: "summarize" }, review(4)])
    ).toEqual([llmTaskFailingKey("summarize"), llmTaskFailingKey("review")]);
  });
});

describe("whole-chain task failure alert through the health check", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetOwnerDmRejections();
  });

  function setup(taskRows: Record<string, unknown>[]) {
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
        results: /GROUP BY task\b/.test(q) ? taskRows : [],
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

  it("DMs the owner naming the dead task and its models", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { env, dms } = setup([
      { task: "score", total: 23, ok: 23, rate_limited: 0, models: "x/a" },
      {
        task: "review",
        total: 8,
        ok: 0,
        rate_limited: 0,
        models: REVIEW_CHAIN.join(","),
      },
    ]);
    const fired = await runHealthCheck(env, { runId: "r1", steps: [] });
    expect(fired).toEqual([llmTaskFailingKey("review")]);
    expect(dms).toHaveLength(1);
    expect(dms[0]).toContain("review");
    expect(dms[0]).toContain("stealth/space-bunny-alpha");
  });

  it("stays quiet when every task has a success", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { env, dms } = setup([
      { task: "score", total: 23, ok: 23, rate_limited: 0, models: "x/a" },
      { task: "review", total: 8, ok: 1, rate_limited: 0, models: "x/b" },
    ]);
    const fired = await runHealthCheck(env, { runId: "r1", steps: [] });
    expect(fired).toEqual([]);
    expect(dms).toEqual([]);
  });
});
