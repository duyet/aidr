import { describe, expect, it } from "vitest";
import { logLlmCall, setLlmCallLogger, withLlmCallContext } from "../llm.js";
import {
  createD1LlmCallLogger,
  resetLlmCallLogSchemaCache,
} from "../llm-call-log.js";
import type { Env } from "../types.js";

function fakeEnv() {
  const statements: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const stmt = {
        bind: (...args: unknown[]) => {
          statements.push({ sql, args });
          return stmt;
        },
        run: async () => ({ success: true }),
      };
      return stmt;
    },
  };
  return { env: { DB: db } as unknown as Env, statements };
}

describe("D1 LLM call telemetry", () => {
  it("writes explicit run identity and sanitized structured errors", async () => {
    resetLlmCallLogSchemaCache();
    const { env, statements } = fakeEnv();
    const logger = createD1LlmCallLogger(env, "reprocess-operation");

    await logger({
      ts: 123,
      task: "score",
      model: "anyrouter/auto",
      ok: false,
      tokens: 0,
      promptTokens: 10,
      completionTokens: null,
      cachedTokens: null,
      durationMs: 5,
      error:
        "anyrouter request failed: 502 prompt=secret https://provider.test/raw",
      promptChars: 100,
      responseSnippet: "bad reply from reader@example.com Bearer tok123",
    });

    const insert = statements.find((s) =>
      s.sql.includes("INSERT INTO llm_calls")
    );
    expect(insert).toBeDefined();
    expect(insert?.args).toContain("reprocess-operation");
    expect(insert?.args).toContain("Provider request failed (502)");
    expect(insert?.args).toContain("provider_error");
    expect(insert?.args).toContain(502);
    expect(insert?.args).toContain(
      "bad reply from [email redacted] Bearer [redacted]"
    );
    expect(insert?.args).not.toContain("secret");
  });

  it("writes no snippet for an ok row", async () => {
    resetLlmCallLogSchemaCache();
    const { env, statements } = fakeEnv();
    await createD1LlmCallLogger(
      env,
      "r"
    )({
      ts: 1,
      task: "score",
      model: "m",
      ok: true,
      tokens: 1,
      promptTokens: null,
      completionTokens: null,
      cachedTokens: null,
      durationMs: 1,
      error: null,
      promptChars: 1,
      responseSnippet: "served answer",
    });
    const insert = statements.find((s) =>
      s.sql.includes("INSERT INTO llm_calls")
    );
    expect(insert?.args).not.toContain("served answer");
  });

  it("uses async context identity for concurrent operations", async () => {
    const seen: string[] = [];
    setLlmCallLogger((entry) => {
      seen.push(entry.runId ?? "none");
    });
    const makeEntry = () => ({
      ts: 1,
      task: "other" as const,
      model: "model",
      ok: true,
      tokens: 0,
      promptTokens: null,
      completionTokens: null,
      cachedTokens: null,
      durationMs: 1,
      error: null,
      promptChars: 0,
      responseSnippet: null,
    });
    await Promise.all([
      withLlmCallContext("run-a", async () => {
        await Promise.resolve();
        logLlmCall(makeEntry());
      }),
      withLlmCallContext("run-b", async () => {
        await Promise.resolve();
        logLlmCall(makeEntry());
      }),
    ]);
    setLlmCallLogger(null);
    expect(seen.sort()).toEqual(["run-a", "run-b"]);
  });
});
