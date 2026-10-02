import { describe, expect, it } from "vitest";
import { runItemWindow } from "./run-items";

describe("runItemWindow", () => {
  it("uses the run's start and finish in seconds", () => {
    expect(runItemWindow(1_700_000_000, 1_700_003_600, 9)).toEqual({
      from: 1_700_000_000,
      to: 1_700_003_600,
    });
  });

  it("treats finished_at equal to started_at as still open", () => {
    expect(runItemWindow(1_700_000_000, 1_700_000_000, 1_700_000_400)).toEqual({
      from: 1_700_000_000,
      to: 1_700_000_400,
    });
  });

  it("accepts a millisecond started_at and an open run", () => {
    expect(runItemWindow(1_700_000_000_000, null, 1_700_000_100)).toEqual({
      from: 1_700_000_000,
      to: 1_700_000_100,
    });
  });

  it("returns nothing when the run has no start", () => {
    expect(runItemWindow(null, 10, 10)).toBeNull();
  });
});
