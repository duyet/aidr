/* @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { LlmCallRow } from "../../lib/system-queries";
import { RunAttemptRows } from "./RunAttemptRows";

const base: LlmCallRow = {
  ts: 1,
  runId: "run-1",
  task: "translate",
  model: "@preset/aidr",
  ok: true,
  tokens: 900,
  durationMs: 4_200,
  promptChars: 10,
  promptTokens: 800,
  completionTokens: 100,
  cachedTokens: 0,
  error: null,
  errorCode: null,
  errorStatus: null,
};

let root: ReturnType<typeof createRoot> | null = null;
function render(attempts: LlmCallRow[]): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root?.render(<RunAttemptRows attempts={attempts} />));
  return el;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("RunAttemptRows", () => {
  // A preset or router alias hides which model ran; the row must name it.
  it("marks a Gemma hop with a monogram instead of a hotlinked logo", () => {
    const el = render([{ ...base, model: "google/gemma-4-31b" }]);
    expect(el.textContent).toContain("Ge");
    expect(el.textContent).toContain("google/gemma-4-31b");
    expect(el.querySelector("img")).toBeNull();
  });

  it("keeps the Laguna image mark on a hop", () => {
    const el = render([{ ...base, model: "poolside/laguna-s-2.1" }]);
    expect(el.querySelector("img")?.getAttribute("src")).toContain(
      "poolside-color.svg"
    );
    expect(el.textContent).not.toContain("Ge");
  });

  it("shows the preset, the model it resolved to, and the provider", () => {
    const el = render([
      {
        ...base,
        route: ["@preset/aidr", "dots-studio/dots-3-note-preview"],
        provider: "AtlasCloud",
      },
    ]);
    expect(el.textContent).toContain("@preset/aidr");
    expect(el.textContent).toContain("dots-studio/dots-3-note-preview");
    expect(el.textContent).toContain("via AtlasCloud");
  });

  // A 429 on the preset followed by a fallback success is one call that
  // worked, not a failure plus an unrelated success.
  it("puts a call's retries on one row and counts calls, not attempts", () => {
    const el = render([
      {
        ...base,
        ts: 1,
        ok: false,
        error: "Provider rate limit reached",
        errorCode: "rate_limited",
        errorStatus: 429,
      },
      { ...base, ts: 2, model: "anyrouter/auto" },
      {
        ...base,
        ts: 3,
        ok: false,
        error: "Provider request timed out",
        errorCode: "timeout",
      },
    ]);
    expect(el.querySelectorAll("li")).toHaveLength(2);
    expect(el.textContent).toContain("2 calls · 1 ok · 1 failed · 3 attempts");
    expect(el.textContent).toContain("Provider request timed out");
  });

  it("shows the price when AnyRouter reported one", () => {
    const el = render([{ ...base, costUsd: 0.0012 } as LlmCallRow]);
    expect(el.textContent).toContain("$0.0012");
  });
});
