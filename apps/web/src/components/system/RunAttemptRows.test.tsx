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
  // A preset or router alias hides which model ran; the panel must show
  // the whole route so a failing upstream model is visible.
  it("shows the preset, the model it resolved to, and the provider", () => {
    const el = render([
      {
        ...base,
        route: ["@preset/aidr", "dots-studio/dots-3-note-preview"],
        provider: "AtlasCloud",
      },
    ]);
    expect(el.textContent).toContain(
      "@preset/aidr→dots-studio/dots-3-note-preview"
    );
    expect(el.textContent).toContain("via AtlasCloud");
  });

  it("falls back to the requested model for rows without a route", () => {
    const el = render([{ ...base, model: "typesafe/jev" }]);
    expect(el.textContent).toContain("typesafe/jev");
    expect(el.textContent).not.toContain("→");
  });

  it("puts the error and its code on a failed attempt", () => {
    const el = render([
      {
        ...base,
        ok: false,
        tokens: 0,
        error: "Provider request timed out",
        errorCode: "timeout",
      },
    ]);
    expect(el.textContent).toContain("1 calls · 0 ok · 1 failed");
    expect(el.textContent).toContain("Provider request timed out");
    expect(el.textContent).toContain("timeout");
  });
});
