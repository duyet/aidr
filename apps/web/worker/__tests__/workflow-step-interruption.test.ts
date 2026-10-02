import type { WorkflowStep } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { bindSentry } from "../bugsink";
import type { RunStepInfo } from "../run-stats.js";
import { safeStep } from "../workflow-step.js";

bindSentry({ SENTRY_DSN: "https://key@bugs.example/1" });

/** Stands in for the Workflow engine failing a step itself, which is the only
 * way these four messages reach us: a deploy resetting the Workflow Durable
 * Object, an instance that went away under an in-flight call, an internal
 * engine fault, or a step that outran its timeout. */
function stepFailingWith(error: unknown) {
  return {
    do: async () => {
      throw error;
    },
  } as unknown as WorkflowStep;
}

const INTERRUPTIONS = [
  [
    "Durable Object reset because its code was updated.",
    "durable object code updated",
  ],
  [
    "Attempt failed due to internal workflows error",
    "internal workflows error",
  ],
  ["Execution timed out after 240000ms", "step timed out"],
  [
    "Connection closed: this Durable Object instance is no longer active. Reconnect or retry the request.",
    "durable object instance went away",
  ],
] as const;

describe("safeStep engine interruptions", () => {
  // The point of dropping the Bugsink report: without a line on the run's step
  // log, an interrupted step would leave the run looking like a plain success.
  it.each(INTERRUPTIONS)(
    "records %s on the run's step line and returns the fallback",
    async (message, reason) => {
      const steps: RunStepInfo[] = [];
      const fetchMock = vi.fn(async () => new Response("ok"));
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await safeStep(
        stepFailingWith(new Error(message)),
        "tldr",
        { generated: false } as const,
        async () => ({ generated: true }),
        { steps }
      );

      expect(result).toEqual({ generated: false });
      expect(steps).toEqual([{ name: "tldr", action: "interrupted", reason }]);
      expect(fetchMock).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    }
  );

  it("records an interruption that arrived as a plain object", async () => {
    const steps: RunStepInfo[] = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await safeStep(
      stepFailingWith({
        name: "Error",
        message: "Execution timed out after 240000ms",
      }),
      "score",
      [],
      async () => ["never"],
      { steps }
    );

    expect(steps).toEqual([
      { name: "score", action: "interrupted", reason: "step timed out" },
    ]);
  });

  // A step with no step line (health-check's own callers, every `llmStep`
  // outside ingest) must still swallow the interruption rather than throw.
  it("still returns the fallback when no step line was passed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      await safeStep(
        stepFailingWith(
          new Error("Attempt failed due to internal workflows error")
        ),
        "tldr",
        "fallback",
        async () => "value"
      )
    ).toBe("fallback");
  });

  // The distinguishing case: an app bug must still reach Bugsink, and must not
  // be dressed up as an interruption.
  it("reports a real step failure instead of recording an interruption", async () => {
    const steps: RunStepInfo[] = [];
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await safeStep(
      stepFailingWith(new Error("D1_ERROR: no such table: items")),
      "write-d1",
      undefined,
      async () => undefined,
      { steps }
    );

    expect(steps).toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  // `rethrowErrors` is checked before the interruption branch, so these three
  // steps still hand engine interruptions to their caller — which then lands
  // them in the run-level catch, where `reportPipelineException` filters them.
  it("still rethrows an interruption for a rethrowing step", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      safeStep(
        stepFailingWith(
          new Error("Attempt failed due to internal workflows error")
        ),
        "notify",
        { sent: { telegram: 0 } },
        async () => ({ sent: { telegram: 1 } }),
        { rethrowErrors: true }
      )
    ).rejects.toThrow("internal workflows error");
  });
});
