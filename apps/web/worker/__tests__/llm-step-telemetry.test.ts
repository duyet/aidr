import { describe, expect, it } from "vitest";
import { logLlmCall, setLlmCallLogger } from "../llm.js";
import {
  createD1LlmCallLogger,
  flushLlmCallWrites,
  resetLlmCallLogSchemaCache,
  withRunLlmCallLogger,
} from "../llm-call-log.js";
import type { Env } from "../types.js";
import { llmStep, safeStep } from "../workflow-step.js";

interface RecordedInsert {
  sql: string;
  args: unknown[];
}

/** Minimal D1 stub: ALTERs succeed, INSERTs are recorded, SELECTs fail so the
 * test can prove which insert shape a given schema reaches. */
function fakeEnv(opts: { failInserts?: boolean } = {}) {
  const statements: RecordedInsert[] = [];
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind: (...bound: unknown[]) => {
          args = bound;
          return stmt;
        },
        run: async () => {
          if (opts.failInserts && sql.includes("INSERT INTO llm_calls")) {
            throw new Error("llm_calls write failed");
          }
          statements.push({ sql, args });
          return { success: true };
        },
        all: async () => ({ results: [] }),
        first: async () => null,
      };
      return stmt;
    },
  };
  return { env: { DB: db } as unknown as Env, statements };
}

/** Stands in for the Workflow engine: runs the callback in a context that no
 * longer has the sink installed at the top of `run()`. */
function stepThatDropsModuleLogger() {
  return {
    do: async <T>(_name: string, ...rest: unknown[]): Promise<T> => {
      const closure = rest[rest.length - 1] as () => Promise<T>;
      // What the engine can do between installing the logger in run() and
      // executing a step callback: hand the callback a context without it.
      setLlmCallLogger(null);
      return closure();
    },
  } as unknown as Parameters<typeof llmStep>[0];
}

function entry(overrides: Partial<Parameters<typeof logLlmCall>[0]> = {}) {
  return {
    ts: 1_700_000_000_000,
    task: "score" as const,
    model: "anyrouter/auto",
    ok: true,
    tokens: 1_000,
    promptTokens: 800,
    completionTokens: 200,
    cachedTokens: 0,
    durationMs: 42,
    error: null,
    promptChars: 4_096,
    responseSnippet: null,
    ...overrides,
  };
}

function llmInserts(statements: RecordedInsert[]): RecordedInsert[] {
  return statements.filter((s) => s.sql.includes("INSERT INTO llm_calls"));
}

describe("withRunLlmCallLogger", () => {
  it("re-installs the D1 sink and stamps the run id after the module logger is gone", async () => {
    resetLlmCallLogSchemaCache();
    const { env, statements } = fakeEnv();
    // A step callback can run where run()'s install never applied.
    setLlmCallLogger(null);

    await withRunLlmCallLogger(env, "run-189", async () => {
      logLlmCall(entry());
      logLlmCall(
        entry({
          model: "openai/gpt-4o",
          ok: false,
          error: "anyrouter request failed: 502",
        })
      );
    });
    await flushLlmCallWrites();

    const inserts = llmInserts(statements);
    expect(inserts).toHaveLength(2);
    // run_id is column 12 of the full insert; every row must carry it.
    for (const insert of inserts) {
      expect(insert.sql).toContain("run_id");
      expect(insert.args).toContain("run-189");
    }
    expect(inserts[1].args).toContain("Provider request failed (502)");
    setLlmCallLogger(null);
  });

  it("drains pending inserts so a step never resolves before its rows land", async () => {
    resetLlmCallLogSchemaCache();
    const { env, statements } = fakeEnv();
    setLlmCallLogger(null);

    // No explicit flush: the step wrapper's own drain must be enough.
    await llmStep(
      stepThatDropsModuleLogger(),
      env,
      "run-189",
      "score",
      [],
      async () => {
        logLlmCall(entry());
        return ["scored"];
      }
    );

    expect(llmInserts(statements)).toHaveLength(1);
    expect(llmInserts(statements)[0].args).toContain("run-189");
    setLlmCallLogger(null);
  });
});

describe("llmStep", () => {
  it("persists every attempt of an LLM step with the step's run id", async () => {
    resetLlmCallLogSchemaCache();
    const { env, statements } = fakeEnv();
    setLlmCallLogger(null);

    const result = await llmStep(
      stepThatDropsModuleLogger(),
      env,
      "run-abc",
      "translate",
      [] as string[],
      async () => {
        logLlmCall(entry({ task: "translate", model: "openai/gpt-4o" }));
        logLlmCall(
          entry({
            task: "translate",
            model: "anthropic/claude",
            ok: false,
            tokens: 0,
            promptTokens: null,
            completionTokens: null,
            error: "anyrouter chain exhausted: anyrouter provider error",
          })
        );
        return ["ok"];
      },
      { retries: { limit: 0, delay: 0 } }
    );

    expect(result).toEqual(["ok"]);
    const inserts = llmInserts(statements);
    expect(inserts).toHaveLength(2);
    for (const insert of inserts) expect(insert.args).toContain("run-abc");
    // Order is preserved so fallback transitions can be derived by ts.
    expect(inserts[0].args).toContain("openai/gpt-4o");
    expect(inserts[1].args).toContain("anthropic/claude");
  });

  it("keeps the step outcome when logging fails", async () => {
    resetLlmCallLogSchemaCache();
    const { env, statements } = fakeEnv({ failInserts: true });
    setLlmCallLogger(null);

    const result = await llmStep(
      stepThatDropsModuleLogger(),
      env,
      "run-189",
      "tldr",
      { generated: false, tokens: 0, reason: "tldr step failed" },
      async () => {
        logLlmCall(
          entry({ task: "tldr", error: "anyrouter request failed: 502" })
        );
        return { generated: true, tokens: 10, reason: "generated" };
      }
    );

    expect(result).toEqual({
      generated: true,
      tokens: 10,
      reason: "generated",
    });
    expect(llmInserts(statements)).toHaveLength(0);
    setLlmCallLogger(null);
  });

  it("returns the fallback when the engine fails the step", async () => {
    resetLlmCallLogSchemaCache();
    const { env } = fakeEnv();
    setLlmCallLogger(null);
    const failingStep = {
      do: async () => {
        throw new Error("step timed out after 240000ms");
      },
    } as unknown as Parameters<typeof llmStep>[0];

    const result = await llmStep(
      failingStep,
      env,
      "run-189",
      "score",
      [] as string[],
      async () => ["never"]
    );

    expect(result).toEqual([]);
  });

  it("leaves non-LLM steps on safeStep: the sink is not installed there", async () => {
    resetLlmCallLogSchemaCache();
    const { env, statements } = fakeEnv();
    setLlmCallLogger(null);

    expect(
      await safeStep(
        stepThatDropsModuleLogger(),
        "open-run",
        undefined,
        async () => "done"
      )
    ).toBe("done");
    // A bare step with no sink drops the entry (logLlmCall's early return),
    // which is exactly why every LLM step goes through llmStep instead.
    logLlmCall(entry());
    await flushLlmCallWrites();
    expect(llmInserts(statements)).toHaveLength(0);
    expect(createD1LlmCallLogger(env, "run-189")).toBeTypeOf("function");
  });
});
