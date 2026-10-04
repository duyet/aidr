import type { WorkflowStep } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IngestContext, NewRow, SourceRow } from "../ingest/context.js";
import { LIVE_FULL_RUN } from "../ingest/mode.js";
import { scoreNewRows, scoreStepRecord } from "../ingest/score.js";
import * as llm from "../llm.js";
import type { Env } from "../types.js";

function source(id: string): SourceRow {
  return { id, type: "rss", config: "{}", enabled: 1 };
}

function row(id: string): NewRow {
  return {
    id,
    source: source("hn"),
    item: {
      url: `https://example.com/${id}`,
      title: `Title ${id}`,
      publishedAt: 1_700_000_000,
    },
  };
}

function rows(n: number): NewRow[] {
  return Array.from({ length: n }, (_, i) => row(`item-${i}`));
}

/** Stands in for `step.do(name, config, fn)`. A failing name is the engine
 * ending the step (timeout) before the callback runs. */
function engineStep(fail: (name: string) => boolean): WorkflowStep {
  return {
    do: async (name: string, a: unknown, b?: unknown) => {
      if (fail(name)) throw new Error("Execution timed out after 300000ms");
      const fn = (typeof a === "function" ? a : b) as () => Promise<unknown>;
      return fn();
    },
  } as unknown as WorkflowStep;
}

function ctxFor(step: WorkflowStep): IngestContext {
  return {
    step,
    env: { DB: {} } as Env,
    runId: "run-1",
    steps: [],
    mode: LIVE_FULL_RUN,
  };
}

function scoredRow(i: number) {
  return {
    i,
    relevance: 0.9,
    importance: 7,
    quality: 8,
    category: "Models",
    tags: ["llm"],
    tokens: 3,
  };
}

describe("scoreStepRecord", () => {
  it("does not call an engine interrupt a score of zero items", () => {
    expect(scoreStepRecord(4, 0, "step timed out")).toEqual({
      action: "interrupted",
      reason: "step timed out",
    });
  });

  it("keeps the count from batches that finished before the interrupt", () => {
    expect(scoreStepRecord(6, 5, "step timed out")).toEqual({
      action: "scored 5 items",
      reason: "step timed out",
    });
  });

  it("still says scored 0 when the models returned nothing", () => {
    expect(scoreStepRecord(4, 0)).toEqual({ action: "scored 0 items" });
  });
});

describe("scoreNewRows checkpoints", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a finished batch when the next step is interrupted", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const scoreItems = vi
      .spyOn(llm, "scoreItems")
      .mockImplementation(async (_env, items) =>
        items.map((item) => scoredRow(item.i))
      );
    const ctx = ctxFor(engineStep((name) => name === "score-1"));

    const scored = await scoreNewRows(ctx, rows(6));

    expect(scoreItems).toHaveBeenCalledTimes(1);
    expect(scoreItems.mock.calls[0]?.[1]).toHaveLength(5);
    expect([...scored.keys()]).toEqual([
      "item-0",
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);
    expect(ctx.steps.map((step) => step.action)).not.toContain(
      "scored 0 items"
    );
    expect(ctx.steps).toContainEqual({
      name: "score-1",
      action: "interrupted",
      reason: "step timed out",
    });
    expect(ctx.steps).toContainEqual({
      name: "score",
      action: "scored 5 items",
      reason: "step timed out",
    });
  });

  it("records an interrupt of the only batch as interrupted, not scored 0", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(llm, "scoreItems").mockImplementation(async (_env, items) =>
      items.map((item) => scoredRow(item.i))
    );
    const ctx = ctxFor(engineStep((name) => name === "score-0"));

    const scored = await scoreNewRows(ctx, rows(2));

    expect(scored.size).toBe(0);
    expect(ctx.steps.map((step) => step.action)).not.toContain(
      "scored 0 items"
    );
    expect(ctx.steps).toContainEqual({
      name: "score-0",
      action: "interrupted",
      reason: "step timed out",
    });
    expect(ctx.steps).toContainEqual({
      name: "score",
      action: "interrupted",
      reason: "step timed out",
    });
  });

  it("keeps a finished batch when the next batch throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    vi.spyOn(llm, "scoreItems").mockImplementation(async (_env, items) => {
      calls += 1;
      if (calls === 2) throw new Error("chain exhausted");
      return items.map((item) => scoredRow(item.i));
    });
    const ctx = ctxFor(engineStep(() => false));

    const scored = await scoreNewRows(ctx, rows(6));

    expect([...scored.keys()]).toEqual([
      "item-0",
      "item-1",
      "item-2",
      "item-3",
      "item-4",
    ]);
    expect(ctx.steps).toContainEqual({
      name: "score",
      action: "scored 5 items",
    });
  });
});
