import { describe, expect, it } from "vitest";
import { logLlmCall, setLlmCallLogger } from "../../worker/llm.js";
import {
  createD1LlmCallLogger,
  resetLlmCallLogSchemaCache,
} from "../../worker/llm-call-log.js";
import type { Env } from "../../worker/types.js";
import { llmStep } from "../../worker/workflow-step.js";
import {
  attachLlmCallsToRuns,
  loadRunAttempts,
  loadSystemRuns,
  type WorkflowRunRow,
} from "./system-queries";

interface LlmCallTableRow {
  ts: number;
  task: string;
  model: string;
  ok: number;
  tokens: number | null;
  duration_ms: number | null;
  error: string | null;
  prompt_chars: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cached_tokens: number | null;
  run_id: string | null;
  error_code: string | null;
  error_status: number | null;
}

const RUN_ID = "run-189-identity";

/** In-memory D1 covering the `llm_calls` writes the telemetry logger makes
 * and the two shapes `/api/system` reads it back with. */
function fakeDb(runRows: Record<string, unknown>[] = []) {
  const calls: LlmCallTableRow[] = [];
  const insertColumns = (sql: string): string[] => {
    const match = /\(([^)]+)\)\s*VALUES/i.exec(sql);
    if (!match) return [];
    return match[1]
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean);
  };

  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind: (...bound: unknown[]) => {
          args = bound;
          return stmt;
        },
        run: async () => {
          if (sql.includes("INSERT INTO llm_calls")) {
            const columns = insertColumns(sql);
            const row: Record<string, unknown> = {};
            columns.forEach((column, index) => {
              row[column] = args[index];
            });
            calls.push(row as unknown as LlmCallTableRow);
          }
          return { success: true };
        },
        first: async () => calls[0] ?? null,
        all: async () => {
          if (sql.includes("FROM workflow_runs")) {
            return { results: runRows };
          }
          if (sql.includes("SELECT llm_tokens")) {
            throw new Error("no such column: llm_tokens");
          }
          if (sql.includes("FROM llm_calls")) {
            // Probe vs. attributed read: only a WHERE on run_id is a lookup.
            if (sql.includes("WHERE run_id = ?")) {
              return {
                results: calls.filter((row) => row.run_id === String(args[0])),
              };
            }
            if (sql.includes("WHERE run_id IN")) {
              const ids = new Set(args.map((id) => String(id)));
              const matched = calls.filter(
                (row) => row.run_id && ids.has(row.run_id)
              );
              if (sql.includes("MIN(ts) AS first_ts")) {
                // Model-inventory query: one row per (run, model), ordered by
                // first-seen ts.
                const firstSeen = new Map<string, LlmCallTableRow>();
                for (const row of matched) {
                  const key = `${row.run_id} ${row.model}`;
                  const prev = firstSeen.get(key);
                  if (!prev || row.ts < prev.ts) firstSeen.set(key, row);
                }
                return {
                  results: [...firstSeen.values()]
                    .sort((a, b) => a.ts - b.ts)
                    .map((row) => ({
                      run_id: row.run_id,
                      model: row.model,
                      first_ts: row.ts,
                    })),
                };
              }
              if (sql.includes("COUNT(*) AS calls")) {
                // Aggregate query: per-run counts, sums and cached presence.
                const byRun = new Map<string, LlmCallTableRow[]>();
                for (const row of matched) {
                  const key = String(row.run_id);
                  byRun.set(key, [...(byRun.get(key) ?? []), row]);
                }
                return {
                  results: [...byRun.entries()].map(([runId, rows]) => ({
                    run_id: runId,
                    calls: rows.length,
                    failures: rows.filter((r) => r.ok === 0).length,
                    tokens: rows.reduce((a, r) => a + (r.tokens ?? 0), 0),
                    duration_ms: rows.reduce(
                      (a, r) => a + (r.duration_ms ?? 0),
                      0
                    ),
                    cached_sum: rows.reduce(
                      (a, r) => a + (r.cached_tokens ?? 0),
                      0
                    ),
                    cached_known: rows.filter((r) => r.cached_tokens != null)
                      .length,
                  })),
                };
              }
              return { results: matched };
            }
            return { results: calls.slice(0, 1) };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
    batch: async (stmts: { all: () => Promise<unknown> }[]) =>
      Promise.all(stmts.map((s) => s.all())),
  };

  return {
    db: db as unknown as D1Database,
    env: { DB: db } as unknown as Env,
    calls,
  };
}

function runRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    started_at: 1_700_000_000,
    finished_at: 1_700_000_100,
    items_fetched: 3,
    items_new: 3,
    error: null,
    stats: JSON.stringify({ tokens: 13_700, steps: [] }),
    ...extra,
  };
}

/** Mirrors the engine hazard: the step callback runs without the sink that
 * the top of `run()` installed. */
function stepWithoutModuleLogger() {
  return {
    do: async <T>(_name: string, ...rest: unknown[]): Promise<T> => {
      const closure = rest[rest.length - 1] as () => Promise<T>;
      setLlmCallLogger(null);
      return closure();
    },
  } as unknown as Parameters<typeof llmStep>[0];
}

describe("#189 run-attempt identity persistence", () => {
  it("attributes a run's attempts by run_id after the logger is reinstalled per step", async () => {
    resetLlmCallLogSchemaCache();
    const { db, env } = fakeDb();
    setLlmCallLogger(null);

    await llmStep(
      stepWithoutModuleLogger(),
      env,
      RUN_ID,
      "score",
      [] as string[],
      async () => {
        logLlmCall({
          ts: 1_700_000_010_000,
          task: "score",
          model: "typesafe/jev",
          ok: true,
          tokens: 9_000,
          promptTokens: 8_000,
          completionTokens: 1_000,
          cachedTokens: 0,
          durationMs: 1_200,
          error: null,
          promptChars: 2_000,
          responseSnippet: null,
        });
        logLlmCall({
          ts: 1_700_000_020_000,
          task: "tldr",
          model: "openai/gpt-4o",
          ok: false,
          tokens: 0,
          promptTokens: null,
          completionTokens: null,
          cachedTokens: null,
          durationMs: 3_000,
          error: "anyrouter request failed: 502",
          promptChars: 2_000,
          responseSnippet: null,
        });
        return ["scored"];
      }
    );

    // /api/system/run-attempts?run_id=…
    const attempts = await loadRunAttempts(db, RUN_ID);
    expect(attempts.status).toBe("ready");
    expect(attempts.attempts.map((attempt) => attempt.model)).toEqual([
      "typesafe/jev",
      "openai/gpt-4o",
    ]);
    expect(attempts.attempts.every((a) => a.runId === RUN_ID)).toBe(true);
    expect(attempts.attempts[1]?.errorStatus).toBe(502);

    // Models used for the expanded run row.
    const runs = attachLlmCallsToRuns(
      [
        {
          id: RUN_ID,
          started_at: 1_700_000_000,
          finished_at: 1_700_000_100,
          items_fetched: 3,
          items_new: 3,
          error: null,
          stats: { tokens: 9_000 },
        } satisfies WorkflowRunRow,
      ],
      attempts.attempts
    );
    expect(runs[0]?.llm?.models).toEqual(["typesafe/jev", "openai/gpt-4o"]);
    expect(runs[0]?.llm?.calls).toBe(2);
    expect(runs[0]?.llm?.failures).toBe(1);
    expect(runs[0]?.llm?.tokens).toBe(9_000);
  });

  it("populates the run list models cell from the same rows", async () => {
    resetLlmCallLogSchemaCache();
    const { db, env } = fakeDb([runRow(RUN_ID)]);
    setLlmCallLogger(null);

    await llmStep(
      stepWithoutModuleLogger(),
      env,
      RUN_ID,
      "translate",
      [] as string[],
      async () => {
        logLlmCall({
          ts: 1_700_000_030_000,
          task: "translate",
          model: "anthropic/claude",
          ok: true,
          tokens: 4_700,
          promptTokens: 4_000,
          completionTokens: 700,
          cachedTokens: 100,
          durationMs: 900,
          error: null,
          promptChars: 1_000,
          responseSnippet: null,
        });
        return ["translated"];
      }
    );

    const runs = await loadSystemRuns(db);
    expect(runs[0]?.llm?.models).toEqual(["anthropic/claude"]);
    expect(runs[0]?.llm?.cachedTokens).toBe(100);
  });

  it("keeps a pre-identity run empty instead of guessing rows by timestamp", async () => {
    resetLlmCallLogSchemaCache();
    const { db, env, calls } = fakeDb();
    setLlmCallLogger(null);

    // A row written by a build that had no run identity at all: the sink
    // carries no fallback id and no run context was active when the step
    // logged, so the insert lands with run_id NULL.
    await createD1LlmCallLogger(env)({
      ts: 1_700_000_010_000,
      task: "score",
      model: "anyrouter/auto",
      ok: true,
      tokens: 5_000,
      promptTokens: 4_000,
      completionTokens: 1_000,
      cachedTokens: null,
      durationMs: 800,
      error: null,
      promptChars: 900,
      responseSnippet: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.run_id).toBeNull();

    const attempts = await loadRunAttempts(db, "legacy-run");
    expect(attempts.status).toBe("ready");
    expect(attempts.attempts).toEqual([]);

    const runs = attachLlmCallsToRuns(
      [
        {
          id: "legacy-run",
          started_at: 1_700_000_000,
          finished_at: 1_700_000_100,
          items_fetched: 1,
          items_new: 1,
          error: null,
          stats: { tokens: 5_000 },
        },
      ],
      attempts.attempts
    );
    expect(runs[0]?.llm).toBeUndefined();
  });
});
