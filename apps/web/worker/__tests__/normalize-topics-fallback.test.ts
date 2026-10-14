import type { WorkflowStep } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { IngestContext, NewRow } from "../ingest/context.js";
import { LIVE_FULL_RUN } from "../ingest/mode.js";
import type { ItemScore } from "../ingest/score.js";
import { normalizeNewRowTopics } from "../ingest/topics.js";
import type { Env } from "../types.js";

function row(id: string): NewRow {
  return {
    id,
    source: { id: "hn", type: "rss", config: "{}", enabled: 1 },
    item: {
      url: `https://example.com/${id}`,
      title: `Title ${id}`,
      publishedAt: 1_700_000_000,
    },
  };
}

function score(tags: string[]): ItemScore {
  return {
    i: 0,
    relevance: 0.9,
    importance: 7,
    quality: 8,
    category: "Models",
    tags,
    tokens: 3,
  };
}

/** `step.do` failing the way the engine does on a timeout or interrupt, so
 * `llmStep` returns its `[]` fallback. */
function failingStep(): WorkflowStep {
  return {
    do: async () => {
      throw new Error("Execution timed out after 300000ms");
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

describe("normalizeNewRowTopics fallback", () => {
  it("keeps the scorer's tags, deduped, when the normalize step fails", async () => {
    const rows = [row("a"), row("b")];
    const scored = new Map([
      ["a", score(["Open Source", "open-source", "llm"])],
      ["b", score([])],
    ]);

    const out = await normalizeNewRowTopics(
      ctxFor(failingStep()),
      rows,
      scored,
      1_700_000_000_000
    );

    expect(out.get("a")).toEqual(["open-source", "llm"]);
    expect(out.get("b")).toEqual([]);
  });

  it("gives an untagged story the deterministic fallback when the step fails", async () => {
    const rows = [row("a"), row("b")];
    rows[0].item.title = "Samsung unveils a new smartphone";
    const scored = new Map([
      ["a", score([])],
      ["b", score(["llm"])],
    ]);
    const known = [
      { name: "samsung", canonical: "samsung" },
      { name: "smartphone", canonical: "smartphone" },
    ];
    const ctx = ctxFor(failingStep());
    ctx.env = {
      DB: {
        prepare: () => ({
          all: async () => ({ results: known }),
        }),
      },
    } as unknown as Env;

    const out = await normalizeNewRowTopics(
      ctx,
      rows,
      scored,
      1_700_000_000_000
    );

    expect(out.get("a")).toEqual(["samsung", "smartphone"]);
    expect(out.get("b")).toEqual(["llm"]);
  });

  it("stores [] and logs when the topics table cannot be read", async () => {
    const rows = [row("a")];
    rows[0].item.title = "Samsung unveils a new smartphone";
    const out = await normalizeNewRowTopics(
      ctxFor(failingStep()),
      rows,
      new Map([["a", score([])]]),
      1_700_000_000_000
    );
    expect(out.get("a")).toEqual([]);
  });
});
