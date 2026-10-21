import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateHealth } from "../health.js";
import type { IngestContext } from "../ingest/context.js";
import { qaTranslations } from "../ingest/reviews.js";
import type { RunStepInfo } from "../run-stats.js";
import type { Env } from "../types.js";

const rate = vi.hoisted(() => vi.fn());

vi.mock("../translation-qa.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../translation-qa.js")>()),
  ratePendingTranslations: rate,
}));

function context(stepDo: () => Promise<unknown>): IngestContext {
  return {
    step: { do: stepDo },
    env: {} as Env,
    runId: "run-1",
    steps: [] as RunStepInfo[],
  } as unknown as IngestContext;
}

const runClosure = (_name: string, _config: unknown, fn: () => unknown) =>
  Promise.resolve(fn());

function alertDetail(steps: RunStepInfo[]): string | undefined {
  return evaluateHealth({
    nowMs: Date.UTC(2026, 9, 11, 7, 41),
    localHour: 14,
    steps,
    telegramLastPostMs: {},
    llm: { total: 0, failed: 0, rateLimited: 0, tasks: [] },
    history: [],
  }).find((issue) => issue.key === "step-failed")?.detail;
}

beforeEach(() => {
  rate.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("qa-translations failure reason (#592)", () => {
  it.each([
    [
      new Error("anyrouter chain exhausted: all models failed"),
      "reviewer provider failed",
    ],
    [
      new Error("review output failed strict v4 validation"),
      "review output invalid",
    ],
    [
      new Error(
        "D1_ERROR: no such column: t.qa_source_revision: SQLITE_ERROR SELECT secret"
      ),
      "database error",
    ],
    [new TypeError("x is undefined"), "TypeError"],
  ])("names %s in the step-failed alert", async (error, reason) => {
    rate.mockRejectedValue(error);
    const ctx = context(runClosure as never);
    await qaTranslations(ctx);
    expect(alertDetail(ctx.steps)).toBe(
      `qa-translations: review failed (${reason})`
    );
  });

  it("records an engine interruption once, not as an empty queue or a failure", async () => {
    const ctx = context(() =>
      Promise.reject(new Error("Step timed out after 300000 ms"))
    );
    await qaTranslations(ctx);
    expect(ctx.steps).toEqual([
      {
        name: "qa-translations",
        action: "interrupted",
        reason: "step timed out",
      },
    ]);
    expect(alertDetail(ctx.steps)).toBeUndefined();
  });
});
