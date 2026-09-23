import { describe, expect, it } from "vitest";
import { WORKFLOW_RUN_STARTED_AT_ORDER_SQL } from "../../worker/workflow-run.js";
import {
  attachLlmCallsToRuns,
  getModelChains,
  loadSystemStats,
} from "./system-queries";

function makeDb(stubs: Record<string, unknown>) {
  const prepare = (sql: string) => {
    const key = Object.keys(stubs).find((k) => sql.includes(k));
    const stub = key
      ? (stubs[key] as {
          first?: () => Promise<unknown>;
          all?: () => Promise<{ results: unknown[] }>;
        })
      : {};
    const stmt = {
      bind: (..._args: unknown[]) => stmt,
      first: async () => stub.first?.() ?? null,
      all: async () => stub.all?.() ?? { results: [] },
    };
    return stmt;
  };
  return {
    prepare,
    batch: async (stmts: { all: () => Promise<unknown> }[]) =>
      Promise.all(stmts.map((s) => s.all())),
  } as unknown as D1Database;
}

describe("loadSystemStats ingest sources", () => {
  it("maps source rows, config JSON, and enabled flags", async () => {
    const db = makeDb({
      "LEFT JOIN items i ON i.source_id": {
        all: async () => ({
          results: [
            {
              id: "hn",
              name: "Hacker News",
              type: "hn",
              config: '{"query":"AI OR LLM"}',
              enabled: 1,
              item_count: 12,
            },
            {
              id: "lobsters",
              name: "Lobsters",
              type: "lobsters",
              config: "{}",
              enabled: 0,
              item_count: 0,
            },
          ],
        }),
      },
      "SELECT llm_tokens": {
        all: async () => {
          throw new Error("no column");
        },
      },
      "FROM llm_calls": {
        all: async () => {
          throw new Error("no table");
        },
      },
      "SELECT stats FROM workflow_runs": {
        all: async () => ({ results: [{ stats: null }] }),
      },
    });
    const stats = await loadSystemStats(db, {});
    expect(stats.ingestSources).toEqual([
      {
        id: "hn",
        name: "Hacker News",
        type: "hn",
        enabled: true,
        itemCount: 12,
        config: { query: "AI OR LLM" },
      },
      {
        id: "lobsters",
        name: "Lobsters",
        type: "lobsters",
        enabled: false,
        itemCount: 0,
        config: {},
      },
    ]);
  });
});

describe("loadSystemStats run timestamp normalization", () => {
  it("normalizes legacy millisecond workflow_runs timestamps", async () => {
    const msStarted = 1_700_000_000_000;
    const db = makeDb({
      "FROM workflow_runs": {
        all: async () => ({
          results: [
            {
              id: "run-1",
              started_at: msStarted,
              finished_at: msStarted + 60_000,
              items_fetched: 1,
              items_new: 1,
              error: null,
              stats: null,
            },
          ],
        }),
      },
      "SELECT llm_tokens": {
        all: async () => {
          throw new Error("no column");
        },
      },
      "FROM llm_calls": {
        all: async () => {
          throw new Error("no table");
        },
      },
      "SELECT stats FROM workflow_runs": {
        all: async () => ({ results: [{ stats: null }] }),
      },
    });

    const stats = await loadSystemStats(db, {});
    expect(stats.ingestSources).toEqual([]);
    expect(stats.runs[0]?.started_at).toBe(Math.floor(msStarted / 1000));
    expect(stats.runs[0]?.finished_at).toBe(
      Math.floor((msStarted + 60_000) / 1000)
    );
  });

  it("orders lastRun with epoch-normalized started_at so leftover ms rows cannot stay on top", async () => {
    const seen: string[] = [];
    const inner = makeDb({
      "FROM workflow_runs": {
        all: async () => ({ results: [] }),
      },
      "SELECT llm_tokens": {
        all: async () => {
          throw new Error("no column");
        },
      },
      "FROM llm_calls": {
        all: async () => {
          throw new Error("no table");
        },
      },
      "SELECT stats FROM workflow_runs": {
        all: async () => ({ results: [{ stats: null }] }),
      },
    });
    const db = {
      prepare(sql: string) {
        seen.push(sql);
        return inner.prepare(sql);
      },
      batch: (stmts: unknown[]) =>
        (
          inner as unknown as { batch: (s: unknown[]) => Promise<unknown> }
        ).batch(stmts),
    } as unknown as D1Database;

    await loadSystemStats(db, {});
    const runsSql = seen.find(
      (sql) => sql.includes("FROM workflow_runs") && sql.includes("LIMIT 30")
    );
    expect(runsSql).toContain(WORKFLOW_RUN_STARTED_AT_ORDER_SQL);
    expect(runsSql).not.toContain("ORDER BY started_at DESC");
  });
});

describe("attachLlmCallsToRuns", () => {
  it("attributes calls by timestamp window and sums usage", () => {
    const runs = [
      {
        id: "run-a",
        started_at: 1_700_000_000,
        finished_at: 1_700_000_120,
        items_fetched: 3,
        items_new: 1,
        error: null,
        stats: { tokens: 10 },
      },
      {
        id: "run-b",
        started_at: 1_700_000_200,
        finished_at: 1_700_000_300,
        items_fetched: 0,
        items_new: 0,
        error: null,
        stats: null,
      },
    ];
    const calls = [
      {
        ts: 1_700_000_010_000,
        task: "score",
        model: "anyrouter/gpt-test",
        ok: true,
        tokens: 100,
        durationMs: 1200,
        promptChars: 40,
        promptTokens: 80,
        completionTokens: 20,
        cachedTokens: 50,
        error: null,
      },
      {
        ts: 1_700_000_050_000,
        task: "translate",
        model: "anyrouter/gpt-test",
        ok: true,
        tokens: 40,
        durationMs: 800,
        promptChars: 20,
        promptTokens: 30,
        completionTokens: 10,
        cachedTokens: 0,
        error: null,
      },
      {
        ts: 1_700_000_250_000,
        task: "tldr",
        model: "anyrouter/other",
        ok: false,
        tokens: 0,
        durationMs: 500,
        promptChars: 10,
        promptTokens: null,
        completionTokens: null,
        cachedTokens: null,
        error: "timeout",
      },
    ];

    const attached = attachLlmCallsToRuns(runs, calls);
    expect(attached[0]?.llm?.models).toEqual(["anyrouter/gpt-test"]);
    expect(attached[0]?.llm?.tokens).toBe(140);
    expect(attached[0]?.llm?.cachedTokens).toBe(50);
    expect(attached[0]?.llm?.durationMs).toBe(2000);
    expect(attached[0]?.llm?.calls).toBe(2);
    expect(attached[0]?.llm?.attempts).toHaveLength(2);

    expect(attached[1]?.llm?.calls).toBe(1);
    expect(attached[1]?.llm?.failures).toBe(1);
    expect(attached[1]?.llm?.models).toEqual(["anyrouter/other"]);
  });

  it("keeps failed→ok models in first-seen order for fallback display", () => {
    const runs = [
      {
        id: "run-fb",
        started_at: 1_700_000_000,
        finished_at: 1_700_000_060,
        items_fetched: 1,
        items_new: 1,
        error: null,
        stats: null,
      },
    ];
    const calls = [
      {
        ts: 1_700_000_010_000,
        task: "score",
        model: "anyrouter/auto",
        ok: false,
        tokens: 0,
        durationMs: 12000,
        promptChars: 100,
        promptTokens: null,
        completionTokens: null,
        cachedTokens: null,
        error: "anyrouter response missing content",
      },
      {
        ts: 1_700_000_022_000,
        task: "score",
        model: "google/gemma-4-26b-a4b-it",
        ok: true,
        tokens: 624,
        durationMs: 5800,
        promptChars: 100,
        promptTokens: 500,
        completionTokens: 124,
        cachedTokens: 0,
        error: null,
      },
      {
        ts: 1_700_000_030_000,
        task: "score",
        model: "anyrouter/auto",
        ok: false,
        tokens: 0,
        durationMs: 3800,
        promptChars: 100,
        promptTokens: null,
        completionTokens: null,
        cachedTokens: null,
        error: "anyrouter response missing content",
      },
      {
        ts: 1_700_000_034_000,
        task: "score",
        model: "google/gemma-4-26b-a4b-it",
        ok: true,
        tokens: 763,
        durationMs: 2100,
        promptChars: 100,
        promptTokens: 600,
        completionTokens: 163,
        cachedTokens: 0,
        error: null,
      },
    ];

    const attached = attachLlmCallsToRuns(runs, calls);
    expect(attached[0]?.llm?.models).toEqual([
      "anyrouter/auto",
      "google/gemma-4-26b-a4b-it",
    ]);
    expect(attached[0]?.llm?.failures).toBe(2);
    expect(attached[0]?.llm?.calls).toBe(4);
  });
});

describe("getModelChains", () => {
  const chat = [
    "anyrouter/auto",
    "deepseek/deepseek-v4.1-flash",
    "poolside/laguna-s-2.1",
    "minimax/m3",
  ];

  it("defaults scoring and decisions to typesafe/jev", () => {
    expect(getModelChains({}).scoring).toEqual(["typesafe/jev"]);
    expect(getModelChains({}).decisions).toEqual(["typesafe/jev"]);
    expect(getModelChains({}).translation).toEqual([]);
    expect(getModelChains({}).tldr).toEqual([]);
  });

  it("puts Jev first on scoring and keeps the chat chain as backup", () => {
    const chains = getModelChains({
      ANYROUTER_MODEL: chat.join(","),
      ANYROUTER_JEV_MODEL: "typesafe/jev",
    });
    expect(chains.scoring).toEqual(["typesafe/jev", ...chat]);
    expect(chains.decisions).toEqual(["typesafe/jev", ...chat]);
  });

  it("does not put Jev on translation or tldr", () => {
    const chains = getModelChains({
      ANYROUTER_MODEL: chat.join(","),
      ANYROUTER_TRANSLATE_MODEL: ["google/gemini-3.5-flash", ...chat].join(","),
      ANYROUTER_TLDR_MODEL: chat.join(","),
      ANYROUTER_JEV_MODEL: "typesafe/jev",
    });
    expect(chains.translation[0]).toBe("google/gemini-3.5-flash");
    expect(chains.translation).not.toContain("typesafe/jev");
    expect(chains.tldr).toEqual(chat);
    expect(chains.scoring[0]).toBe("typesafe/jev");
  });

  it("splits a configured Jev chain and still appends the chat backup", () => {
    expect(
      getModelChains({
        ANYROUTER_JEV_MODEL: "typesafe/jev-preview,typesafe/jev",
        ANYROUTER_MODEL: "anyrouter/auto",
      }).decisions
    ).toEqual(["typesafe/jev-preview", "typesafe/jev", "anyrouter/auto"]);
  });

  it("does not list the same id twice when Jev is also on the chat chain", () => {
    expect(
      getModelChains({
        ANYROUTER_JEV_MODEL: "typesafe/jev",
        ANYROUTER_MODEL: "typesafe/jev,anyrouter/auto",
      }).scoring
    ).toEqual(["typesafe/jev", "anyrouter/auto"]);
  });
});
