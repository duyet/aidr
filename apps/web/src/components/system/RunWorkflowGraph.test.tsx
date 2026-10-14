/* @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { LlmCallRow } from "../../lib/system-queries";
import { RunWorkflowGraph } from "./RunWorkflowGraph";

const call = (task: string, model: string, ok: boolean): LlmCallRow => ({
  ts: 1,
  runId: "r",
  task,
  model,
  ok,
  tokens: ok ? 10 : 0,
  durationMs: 5,
  promptChars: null,
  promptTokens: null,
  completionTokens: null,
  cachedTokens: null,
  error: ok ? null : "Provider request timed out",
  errorCode: ok ? null : "timeout",
  errorStatus: null,
});

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("RunWorkflowGraph", () => {
  it("explains a cooled chain as no call made, not as every model failing", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    act(() =>
      root?.render(
        <RunWorkflowGraph
          steps={[
            {
              name: "tldr",
              action: "skipped",
              reason:
                "anyrouter chain exhausted: openai/gpt-4o: rate limit cooldown",
            },
          ]}
          attempts={[]}
        />
      )
    );
    expect(el.textContent).toContain("no call was made");
    expect(el.textContent).not.toContain(
      "Every model in the fallback chain failed"
    );
  });

  // The point of the diagram: the failing step is explained without hunting,
  // and each step's LLM calls sit on that step, not in one flat list.
  it("opens on the failing step with its cause, and shows a node's own calls on click", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    act(() =>
      root?.render(
        <RunWorkflowGraph
          steps={[
            { name: "score", action: "scored 2 items" },
            { name: "tldr", action: "skipped", reason: "tldr step failed" },
          ]}
          attempts={[
            call("score", "typesafe/jev", true),
            call("tldr", "x/hang", false),
          ]}
        />
      )
    );
    expect(el.textContent).toContain("Why:");
    expect(el.textContent).toContain("x/hang");
    expect(el.textContent).not.toContain("typesafe/jev");

    const score = [...el.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("score")
    );
    act(() => score?.click());
    expect(el.textContent).toContain("typesafe/jev");
    expect(el.textContent).not.toContain("x/hang");
  });

  // The Telegram caption summary is the notify step's only LLM call.
  it("shows caption calls on the notify step", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    act(() =>
      root?.render(
        <RunWorkflowGraph
          steps={[{ name: "notify", action: "sent 3 stories" }]}
          attempts={[call("caption", "x/caption-model", false)]}
        />
      )
    );
    const notify = [...el.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("notify")
    );
    act(() => notify?.click());
    expect(el.textContent).toContain("x/caption-model");
  });
});
