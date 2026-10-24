import { describe, expect, it } from "vitest";
import { modelAttemptTimeoutMs } from "../llm.js";
import { LLM_SLICE_MAX_MS, LLM_TIMEOUT_MS } from "../notify/story-summary.js";

// #1034: with a 30s budget a hung first id ate 15s and left each of the
// three fallbacks 5s, so the whole caption chain timed out. Sonnet's
// successful caption calls take about 5s, so a fallback needs real room.
describe("caption chain budget", () => {
  it("leaves every fallback at least 10s when each id hangs to its cap", () => {
    const models = 4; // ANYROUTER_MODEL
    let remaining = LLM_TIMEOUT_MS;
    const slices: number[] = [];
    for (let i = 0; i < models; i++) {
      const slice = modelAttemptTimeoutMs(
        remaining,
        models - i,
        LLM_SLICE_MAX_MS
      );
      slices.push(slice);
      remaining -= slice;
    }
    expect(slices[0]).toBeGreaterThanOrEqual(15_000);
    for (const slice of slices.slice(1)) {
      expect(slice).toBeGreaterThanOrEqual(10_000);
    }
  });
});
