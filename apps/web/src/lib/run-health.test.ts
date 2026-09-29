import { describe, expect, it } from "vitest";
import { toLatestRunSummary } from "./feed-freshness";
import {
  classifyRunHealth,
  hasFailedStep,
  isLatestRunSummary,
  type LatestRunSummary,
} from "./run-health";

const NOW = 1_800_000_000;
const HOUR = 3600;

function run(over: Partial<LatestRunSummary> = {}): LatestRunSummary {
  return {
    id: "r1",
    startedAt: NOW - HOUR,
    finishedAt: NOW - HOUR + 120,
    failed: false,
    degraded: false,
    ...over,
  };
}

describe("classifyRunHealth", () => {
  it("is green when the newest run succeeded within two hours", () => {
    expect(classifyRunHealth(run(), NOW)).toBe("ok");
  });

  it("is yellow when a step failed even though the run finished", () => {
    // Readers should see partial failures without the site looking down.
    expect(classifyRunHealth(run({ degraded: true }), NOW)).toBe("degraded");
  });

  it("is yellow when the newest run is 2-6 hours old", () => {
    const at = NOW - 3 * HOUR;
    expect(classifyRunHealth(run({ startedAt: at, finishedAt: at }), NOW)).toBe(
      "degraded"
    );
  });

  it("is red when the newest run recorded an error, however recent", () => {
    expect(classifyRunHealth(run({ failed: true }), NOW)).toBe("down");
  });

  it("is red when no run happened in over six hours", () => {
    const at = NOW - 6 * HOUR - 1;
    expect(classifyRunHealth(run({ startedAt: at, finishedAt: at }), NOW)).toBe(
      "down"
    );
  });

  it("is red with no run or no timestamps", () => {
    expect(classifyRunHealth(null, NOW)).toBe("down");
    expect(
      classifyRunHealth(run({ startedAt: null, finishedAt: null }), NOW)
    ).toBe("down");
  });

  it("uses start time for an in-progress run", () => {
    expect(
      classifyRunHealth(run({ startedAt: NOW - 60, finishedAt: null }), NOW)
    ).toBe("ok");
  });
});

describe("hasFailedStep", () => {
  it("flags a step whose action or reason names a failure", () => {
    expect(
      hasFailedStep({ steps: [{ name: "qa", action: "review failed" }] })
    ).toBe(true);
    expect(hasFailedStep({ steps: [{ name: "email", action: "error" }] })).toBe(
      true
    );
    expect(
      hasFailedStep({
        steps: [{ name: "fetch", action: "12 new", reason: "2 source errors" }],
      })
    ).toBe(true);
  });

  it("ignores normal steps and malformed stats", () => {
    expect(
      hasFailedStep({
        steps: [
          { name: "dedupe", action: "0 new", reason: "27 already in db" },
        ],
      })
    ).toBe(false);
    expect(hasFailedStep(null)).toBe(false);
    expect(hasFailedStep({ steps: "nope" })).toBe(false);
  });
});

describe("toLatestRunSummary", () => {
  it("maps a workflow_runs row, normalizing ms timestamps", () => {
    const summary = toLatestRunSummary({
      id: "abc",
      started_at: 1_700_000_000_000,
      finished_at: 1_700_000_060,
      error: null,
      stats: JSON.stringify({ steps: [{ name: "qa", action: "error" }] }),
    });
    expect(summary).toEqual({
      id: "abc",
      startedAt: 1_700_000_000,
      finishedAt: 1_700_000_060,
      failed: false,
      degraded: true,
    });
    expect(isLatestRunSummary(summary)).toBe(true);
  });

  it("marks a row with an error as failed and tolerates bad stats", () => {
    expect(
      toLatestRunSummary({
        id: "x",
        started_at: 1,
        finished_at: null,
        error: "boom",
        stats: "{bad",
      })
    ).toMatchObject({ failed: true, degraded: false });
  });

  it("returns null without a row", () => {
    expect(toLatestRunSummary(null)).toBeNull();
  });
});
