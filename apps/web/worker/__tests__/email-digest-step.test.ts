import type { WorkflowStep } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestContext } from "../ingest/context.js";
import { sendEmailDigest } from "../ingest/publish.js";
import type { RunStepInfo } from "../run-stats.js";

const { sendDailyTldr, reportPipelineException } = vi.hoisted(() => ({
  sendDailyTldr: vi.fn(),
  reportPipelineException: vi.fn(async () => {}),
}));

vi.mock("../subscribe/send.js", () => ({ sendDailyTldr }));
vi.mock("../bugsink.js", async (original) => ({
  ...(await original<typeof import("../bugsink.js")>()),
  reportPipelineException,
}));

function makeCtx(): { ctx: IngestContext; steps: RunStepInfo[] } {
  const steps: RunStepInfo[] = [];
  const step = {
    do: async (_name: string, fn: () => Promise<unknown>) => fn(),
  } as unknown as WorkflowStep;
  return {
    steps,
    ctx: { step, env: {}, steps, mode: { dryRun: false } } as IngestContext,
  };
}

describe("sendEmailDigest", () => {
  beforeEach(() => {
    sendDailyTldr.mockReset();
    reportPipelineException.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("records no subscribers as skipped and reports nothing", async () => {
    sendDailyTldr.mockResolvedValue(0);
    const { ctx, steps } = makeCtx();
    expect(await sendEmailDigest(ctx)).toBe(0);
    expect(steps).toEqual([
      {
        name: "email",
        action: "skipped",
        reason: "no eligible subscribers this run",
      },
    ]);
    expect(reportPipelineException).not.toHaveBeenCalled();
  });

  it("reports a real failure to Bugsink and records the step as failed", async () => {
    const boom = new Error("D1_ERROR: no such table: subscribers");
    sendDailyTldr.mockRejectedValue(boom);
    const { ctx, steps } = makeCtx();
    expect(await sendEmailDigest(ctx)).toBe(0);
    expect(reportPipelineException).toHaveBeenCalledWith(boom, {
      step: "email-digest",
      kind: "exception",
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ name: "email", action: "failed" });
    // The reason is sanitized, so it must be set but need not echo the raw text.
    expect(steps[0].reason).toBeTruthy();
    expect(steps[0].reason).not.toContain("no eligible subscribers");
  });

  it("records the sent count on success", async () => {
    sendDailyTldr.mockResolvedValue(3);
    const { ctx, steps } = makeCtx();
    expect(await sendEmailDigest(ctx)).toBe(3);
    expect(steps[0].action).toBe("sent to 3 subscribers");
  });
});
