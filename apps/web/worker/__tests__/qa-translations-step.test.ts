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

// #592: the alert read "qa-translations: review failed" with nothing to say
// whether D1, the code, or the Workflow engine ended the step.
describe("qa-translations failure reason", () => {
  it("names a D1 failure in the step-failed alert without the SQL", async () => {
    rate.mockRejectedValue(
      new Error(
        "D1_ERROR: no such column: t.qa_source_revision: SQLITE_ERROR SELECT secret"
      )
    );
    const ctx = context(runClosure as never);
    await qaTranslations(ctx);
    const detail = alertDetail(ctx.steps);
    expect(detail).toBe("qa-translations: review failed (database error)");
  });

  it("names a code fault by its error class", async () => {
    rate.mockRejectedValue(new TypeError("x is undefined"));
    const ctx = context(runClosure as never);
    await qaTranslations(ctx);
    expect(alertDetail(ctx.steps)).toBe(
      "qa-translations: review failed (TypeError)"
    );
  });

  // The engine ending the step used to fall back to "0 pending translations",
  // which reads as an empty queue.
  it("reports a step the Workflow engine ended as failed, not as no work", async () => {
    const ctx = context(() =>
      Promise.reject(new Error("Workflow step timed out"))
    );
    await qaTranslations(ctx);
    expect(ctx.steps).toContainEqual(
      expect.objectContaining({ name: "qa-translations" })
    );
    expect(alertDetail(ctx.steps)).toMatch(
      /^qa-translations: review failed \(.+\)$/
    );
  });
});
