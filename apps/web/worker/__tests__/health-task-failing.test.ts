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
import {
  buildIssueBody,
  fingerprint,
  issueEvidence,
  type ModelStat,
  resetOwnerDmRejections,
} from "../owner-alerts.js";
import type { Env } from "../types.js";

/** 14:00 local, outside the daily-summary and day-video windows. */
const NOW = Date.UTC(2026, 9, 14, 7, 0);
const HOUR = 3600 * 1000;
const REVIEW_CHAIN = ["z-ai/glm-4.6", "z-ai/glm-5.2"];

const ok = (task: string, n: number): LlmTaskCount => ({
  task,
  total: n,
  ok: n,
  rateLimited: 0,
  models: [
    { model: "google/gemini-3-flash", total: n, failed: 0, statuses: {} },
  ],
});

/** Attempts alternate across the review chain; the 429s land on the head. */
function review(total: number, okCount = 0, rateLimited = 0): LlmTaskCount {
  const models: ModelStat[] = REVIEW_CHAIN.map((model) => ({
    model,
    total: 0,
    failed: 0,
    statuses: {},
  }));
  for (let i = 0; i < total; i++) {
    const m = models[i % models.length]!;
    m.total++;
    if (i < okCount) continue;
    m.failed++;
    const status = i < okCount + rateLimited ? "429" : "error";
    m.statuses[status] = (m.statuses[status] ?? 0) + 1;
  }
  return { task: "review", total, ok: okCount, rateLimited, models };
}

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

  // The GitHub fingerprint picks the issue an alert comments on. Built from
  // the run's worst model, a review outage would land on whichever model
  // failed most for some other task in the same run.
  it("fingerprints and evidences the failing task's own models", () => {
    const [issue] = evaluateHealth(input([ok("score", 20), review(4)]));
    const runWide: ModelStat[] = [
      {
        model: "google/gemma-latest",
        total: 30,
        failed: 12,
        statuses: { "502": 12 },
      },
      ...review(4).models,
    ];
    const ctx = {
      runId: "r1",
      nowMs: NOW,
      models: runWide,
      telegramQuietHours: {},
    };
    expect(fingerprint(issue!, ctx)).toBe(
      "llm:model=z-ai/glm-4.6:status=error"
    );
    const evidence = issueEvidence(issue!, ctx).join("\n");
    expect(evidence).toContain("z-ai/glm-4.6: 0/2 ok");
    expect(evidence).not.toContain("gemma-latest");
  });

  // The issue table must list the same models the fingerprint and DM use,
  // not every model the run touched for other tasks.
  it("lists only the failing task's models in the issue body", () => {
    const [issue] = evaluateHealth(
      input([ok("score", 20), ok("translate", 8), review(4)])
    );
    const ctx = {
      runId: "r1",
      nowMs: NOW,
      models: [
        ...ok("score", 20).models,
        ...ok("translate", 8).models,
        ...review(4).models,
      ],
      telegramQuietHours: {},
    };
    const body = buildIssueBody(issue!, ctx, fingerprint(issue!, ctx));
    for (const model of REVIEW_CHAIN) expect(body).toContain(`| ${model} |`);
    expect(body).not.toContain("gemini-3-flash");
  });
});

describe("whole-chain task failure alert through the health check", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetOwnerDmRejections();
  });

  /** Rows for `GROUP BY task, model, ok, error_status, error_code`. */
  type CallRow = {
    task: string;
    model: string;
    ok: number;
    status: number | null;
    code?: string | null;
    n: number;
  };

  function setup(rows: CallRow[]) {
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
    const runWide = (): Omit<CallRow, "task">[] => {
      const byKey = new Map<string, Omit<CallRow, "task">>();
      for (const { task: _task, ...r } of rows) {
        const key = `${r.model}|${r.ok}|${r.status}|${r.code}`;
        const seen = byKey.get(key);
        byKey.set(key, { ...r, n: (seen?.n ?? 0) + r.n });
      }
      return [...byKey.values()];
    };
    const query = (q: string) => ({
      all: async () => ({
        results: /GROUP BY task\b/.test(q)
          ? rows
          : /GROUP BY model\b/.test(q)
            ? runWide()
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

  it("DMs the owner naming the dead task and only its models", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { env, dms } = setup([
      { task: "score", model: "x/a", ok: 1, status: null, n: 20 },
      { task: "score", model: "x/a", ok: 0, status: 502, n: 3 },
      { task: "review", model: REVIEW_CHAIN[0]!, ok: 0, status: null, n: 5 },
      { task: "review", model: REVIEW_CHAIN[1]!, ok: 0, status: 504, n: 3 },
    ]);
    const fired = await runHealthCheck(env, { runId: "r1", steps: [] });
    expect(fired).toEqual([llmTaskFailingKey("review")]);
    expect(dms).toHaveLength(1);
    expect(dms[0]).toContain("All 8 review attempts failed");
    expect(dms[0]).toContain(`${REVIEW_CHAIN[0]}: 0/5 ok (error×5)`);
    expect(dms[0]).toContain(`${REVIEW_CHAIN[1]}: 0/3 ok (504×3)`);
    expect(dms[0]).not.toContain("x/a");
  });

  // #670 (AIDR-17): the alert named four dead hops but not why each failed.
  it("names each hop's failure cause in the alert detail", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { env } = setup([
      { task: "score", model: "x/a", ok: 1, status: null, n: 20 },
      { task: "other", model: "@preset/aidr", ok: 0, status: 502, n: 1 },
      {
        task: "other",
        model: "anyrouter/auto",
        ok: 0,
        status: null,
        code: "timeout",
        n: 1,
      },
      {
        task: "other",
        model: "google/gemma-latest",
        ok: 0,
        status: null,
        code: "invalid_response",
        n: 1,
      },
      {
        task: "other",
        model: "z-ai/glm-latest",
        ok: 0,
        status: null,
        code: null,
        n: 1,
      },
    ]);
    await runHealthCheck(env, { runId: "r1", steps: [] });
    const { reportHealthAlert } = await import("../bugsink.js");
    const alert = vi.mocked(reportHealthAlert).mock.calls.at(-1)?.[1];
    expect(JSON.stringify(alert)).toContain(
      "@preset/aidr: 502×1, anyrouter/auto: timeout×1, google/gemma-latest: invalid_response×1, z-ai/glm-latest: error×1"
    );
  });

  it("stays quiet when every task has a success", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { env, dms } = setup([
      { task: "score", model: "x/a", ok: 1, status: null, n: 23 },
      { task: "review", model: "x/b", ok: 1, status: null, n: 1 },
      { task: "review", model: "x/b", ok: 0, status: null, n: 7 },
    ]);
    const fired = await runHealthCheck(env, { runId: "r1", steps: [] });
    expect(fired).toEqual([]);
    expect(dms).toEqual([]);
  });

  it("subtracts 429s per task from the attempts the alert counts", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { env } = setup([
      { task: "score", model: "x/a", ok: 1, status: null, n: 20 },
      { task: "review", model: "x/b", ok: 0, status: 429, n: 2 },
      { task: "review", model: "x/b", ok: 0, status: null, n: 2 },
    ]);
    expect(await runHealthCheck(env, { runId: "r1", steps: [] })).toEqual([]);
  });
});
