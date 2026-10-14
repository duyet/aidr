import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type LlmCallLogEntry,
  resetUnavailableModels,
  setLlmCallLogger,
} from "../llm.js";
import { captionSummaryFor } from "../notify/story-summary.js";
import type { Env } from "../types.js";

const BUDGET = 200;

function sse(content: string): Response {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
    { status: 200 }
  );
}

function envWith(writes: unknown[][]): Env {
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => null,
          run: async () => {
            writes.push([sql, ...args]);
          },
        }),
      }),
    } as unknown as D1Database,
    NEWS_INGEST: {} as Workflow,
    ANYROUTER_BASE_URL: "https://anyrouter.test/api/v1",
    ANYROUTER_MODEL: "test-model",
    ANYROUTER_API_KEY: "test-key",
    NEWS_ADMIN_TOKEN: "test-token",
  };
}

const story = {
  id: "s1",
  title: "Broadcom backs Anthropic debt",
  summary:
    "Broadcom backs a 42 billion USD debt package for Anthropic. ".repeat(12),
  lang: "en" as const,
};

async function summarize(answer: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => sse(JSON.stringify({ summary: answer })))
  );
  const writes: unknown[][] = [];
  const entries: LlmCallLogEntry[] = [];
  setLlmCallLogger((entry) => {
    entries.push(entry);
  });
  try {
    const out = await captionSummaryFor(envWith(writes), story, BUDGET);
    return { out, writes, entries };
  } finally {
    setLlmCallLogger(null);
  }
}

beforeEach(() => {
  resetUnavailableModels();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("caption summary telemetry", () => {
  it("logs an over-budget answer that still has whole sentences inside the budget as ok, under its own task", async () => {
    const first = "Broadcom backs a 42 billion USD debt package for Anthropic.";
    const answer = `${first} ${"Chip stocks fell after the remarks. ".repeat(8).trim()}`;
    expect(answer.length).toBeGreaterThan(BUDGET);

    const { out, writes, entries } = await summarize(answer);

    expect(out?.startsWith(first)).toBe(true);
    expect(writes).toHaveLength(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ task: "caption", ok: true });
  });

  it("logs bad_output only when the answer is thrown away for a source trim", async () => {
    const oneLongSentence = `${"Broadcom backs a debt package ".repeat(10).trim()}.`;
    expect(oneLongSentence.length).toBeGreaterThan(BUDGET);

    const { out, writes, entries } = await summarize(oneLongSentence);

    expect(out).toBeNull();
    expect(writes).toHaveLength(0);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      task: "caption",
      ok: false,
      error: "anyrouter bad output",
    });
  });
});
