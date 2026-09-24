import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkflowRunRow } from "../../lib/system-queries";
import { RunRow } from "./RunRow";

const run: WorkflowRunRow = {
  id: "run/1",
  started_at: 1_700_000_000,
  finished_at: 1_700_000_045,
  items_fetched: 3,
  items_new: 2,
  error: null,
  stats: { tokens: 500, bySource: { hn: 3 } },
  llm: {
    calls: 1,
    failures: 0,
    tokens: 500,
    cachedTokens: 0,
    durationMs: 40,
    models: ["anyrouter/auto"],
    attempts: [],
  },
};

describe("RunRow disclosure affordance", () => {
  it("keeps metrics compact while exposing a labeled token toggle", () => {
    const html = renderToStaticMarkup(
      createElement(RunRow, {
        run,
        lang: "en",
        maxDuration: 60,
        expanded: false,
        loadingAttempts: false,
        attempts: [],
        onToggle: () => undefined,
      })
    );

    expect(html).toContain("500");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="run-details-run-1"');
    expect(html).toContain('aria-label="Show run details · 500 tokens"');
    expect(html).not.toContain("Workflow steps");
  });

  it("shows real run details without leaking provider payloads", () => {
    const detailedRun: WorkflowRunRow = {
      ...run,
      error: "anyrouter request failed: 502 upstream body",
      stats: {
        ...run.stats,
        steps: [
          { name: "score", action: "scored 2" },
          {
            name: "notify",
            action: "skipped",
            reason: "no eligible subscribers",
          },
        ],
      },
      llm: {
        ...run.llm!,
        failures: 1,
        models: ["anyrouter/auto", "google/gemini"],
      },
    };
    const html = renderToStaticMarkup(
      createElement(RunRow, {
        run: detailedRun,
        lang: "en",
        maxDuration: 60,
        expanded: true,
        loadingAttempts: false,
        attempts: [
          {
            ts: 1_700_000_010_000,
            task: "score",
            model: "anyrouter/auto",
            ok: false,
            tokens: 0,
            durationMs: 20,
            promptChars: 10,
            promptTokens: 100,
            completionTokens: 0,
            cachedTokens: 0,
            error: "prompt: secret prompt text",
          },
        ],
        onToggle: () => undefined,
      })
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Run summary");
    expect(html).toContain("Workflow steps");
    expect(html).toContain("anyrouter/auto");
    expect(html).toContain("google/gemini");
    expect(html).toContain("Input");
    expect(html).toContain("Output");
    expect(html).toContain("Cached");
    expect(html).toContain("Fallback chain");
    expect(html).toContain("anyrouter request failed: 502");
    expect(html).toContain("prompt: [redacted]");
    expect(html).not.toContain("secret prompt text");
  });
});
