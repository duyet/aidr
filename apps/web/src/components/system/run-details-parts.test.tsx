/**
 * RunDetails is composed from the pieces below. Each is rendered on its own
 * so a regression points at the piece that broke: a model that stops
 * linking, a failed step shown as ok, or a fallback that never reaches the
 * errors panel an operator reads when a run goes wrong.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LlmCallRow, WorkflowRunRow } from "../../lib/system-queries";
import { RunErrorsPanel } from "./RunErrorsPanel";
import { RunModelLinks } from "./RunModelLinks";
import { RunStepList } from "./RunStepList";
import { COPY, statusLabel } from "./run-details-copy";

describe("run details copy", () => {
  it("labels every run status in both languages", () => {
    for (const lang of ["en", "vi"] as const) {
      expect(statusLabel("ok", lang)).toBe(COPY[lang].ok);
      expect(statusLabel("error", lang)).toBe(COPY[lang].error);
      expect(statusLabel("in_progress", lang)).toBe(COPY[lang].inProgress);
    }
    expect(Object.keys(COPY.vi).sort()).toEqual(Object.keys(COPY.en).sort());
  });
});

describe("RunModelLinks", () => {
  it("links valid AnyRouter models and leaves unknown ids as text", () => {
    const html = renderToStaticMarkup(
      <RunModelLinks models={["anyrouter/auto", "not a model"]} />
    );
    expect(html.match(/<a /g)?.length).toBe(1);
    expect(html).toContain("not a model");
  });
});

describe("RunStepList", () => {
  it("marks failed steps differently from ok steps and shows reasons", () => {
    const html = renderToStaticMarkup(
      <RunStepList
        steps={[
          { name: "ingest", action: "done" },
          { name: "tldr", action: "failed", reason: "chain exhausted" },
        ]}
      />
    );
    expect(html).toContain("ingest");
    expect(html).toContain("chain exhausted");
    expect(html).toContain("text-destructive");
    expect(html).toContain("text-emerald-600");
  });
});

describe("RunErrorsPanel", () => {
  const run = { error: null } as unknown as WorkflowRunRow;

  it("says nothing went wrong when there is nothing to report", () => {
    const html = renderToStaticMarkup(
      <RunErrorsPanel
        run={run}
        lang="en"
        failedAttempts={[]}
        fallback={[]}
        stepNotes={[]}
      />
    );
    expect(html).toContain(COPY.en.noErrors);
  });

  it("lists model fallbacks and failed attempts", () => {
    const failed = {
      ts: 1,
      task: "score",
      model: "m",
      error: "timeout",
    } as unknown as LlmCallRow;
    const html = renderToStaticMarkup(
      <RunErrorsPanel
        run={run}
        lang="en"
        failedAttempts={[failed]}
        fallback={[{ task: "tldr", from: "a/one", to: "b/two" }]}
        stepNotes={[]}
      />
    );
    expect(html).toContain(COPY.en.fallback);
    expect(html).toContain("score");
    expect(html).not.toContain(COPY.en.noErrors);
  });
});
