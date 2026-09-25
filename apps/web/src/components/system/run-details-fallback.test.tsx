/* @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type {
  LlmCallRow,
  WorkflowRunRow,
  WorkflowRunStats,
} from "../../lib/system-queries";
import { RunDetails } from "./RunDetails";
import type { RunAttemptsState } from "./run-format";

const attempt: LlmCallRow = {
  ts: 1_700_000_010_000,
  runId: "run-1",
  task: "score",
  model: "anyrouter/auto",
  ok: true,
  tokens: 1_000,
  durationMs: 20,
  promptChars: 10,
  promptTokens: 800,
  completionTokens: 200,
  cachedTokens: 0,
  error: null,
  errorCode: null,
  errorStatus: null,
};

function runWith(overrides: Partial<WorkflowRunRow> = {}): WorkflowRunRow {
  return {
    id: "run-1",
    started_at: 1_700_000_000,
    finished_at: 1_700_000_100,
    items_fetched: 3,
    items_new: 3,
    error: null,
    stats: null,
    ...overrides,
  };
}

function render(
  run: WorkflowRunRow,
  attemptsState: RunAttemptsState,
  attempts: LlmCallRow[] = []
): HTMLElement {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RunDetails
        run={run}
        lang="en"
        attemptsState={attemptsState}
        attempts={attempts}
        onClose={() => {}}
        triggerRef={{ current: null }}
      />
    )
  );
  return host;
}

const chainStats: WorkflowRunStats = {
  tokens: 13_700,
  bySource: { hn: 3 },
  steps: [
    { name: "fetch", action: "48 items from 9 sources" },
    { name: "translate", action: "translated 3/3 items" },
    {
      name: "tldr",
      action: "skipped",
      reason:
        "anyrouter chain exhausted: openai/gpt-4o: anyrouter request failed: 502 | google/gemini: anyrouter provider error",
    },
  ],
};

afterEach(() => {
  document.body.innerHTML = "";
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;
});

describe("RunDetails errors / fallback (#189)", () => {
  it("mirrors a step fallback chain instead of reporting no error", () => {
    const host = render(runWith({ stats: chainStats }), "empty");

    expect(host.textContent).not.toContain("No error recorded.");
    expect(host.textContent).toContain("Reported by workflow steps");
    expect(host.textContent).toContain("tldr: Fallback chain exhausted");
    expect(host.textContent).toContain("anyrouter chain exhausted");
  });

  it("labels a pre-identity run instead of showing bare empty copies", () => {
    const host = render(runWith({ stats: chainStats }), "empty");

    expect(host.textContent).not.toContain("No model data available.");
    expect(host.textContent).toContain("before per-attempt run identity");
    expect(host.textContent).toContain(
      "no per-attempt rows. Runs logged before per-attempt run identity shipped"
    );
  });

  it("keeps the plain empty copy for a run that spent no tokens", () => {
    const host = render(runWith({ stats: { tokens: 0, steps: [] } }), "empty");

    expect(host.textContent).toContain("No error recorded.");
    expect(host.textContent).toContain("No model data available.");
    expect(host.textContent).toContain("No LLM calls recorded for this run.");
  });

  it("shows real models and attempts once identity exists", () => {
    const host = render(
      runWith({
        stats: { tokens: 1_000, steps: [] },
        llm: {
          calls: 1,
          failures: 0,
          tokens: 1_000,
          cachedTokens: 0,
          durationMs: 20,
          models: ["typesafe/jev"],
          attempts: [attempt],
        },
      }),
      "ready",
      [attempt]
    );

    expect(host.querySelector("a")?.getAttribute("href")).toContain("jev");
    expect(host.textContent).not.toContain("No model data available.");
    expect(host.textContent).not.toContain("before per-attempt run identity");
  });
});
