import { describe, expect, it } from "vitest";
import {
  sanitizeError,
  sanitizeRunStatsJson,
  sanitizeText,
} from "../telemetry-safe.js";

describe("telemetry redaction", () => {
  it("classifies provider failures without returning raw diagnostics", () => {
    expect(
      sanitizeError(
        'anyrouter request failed: 502 {"error":{"prompt":"secret"}}'
      )
    ).toEqual({
      message: "Provider request failed (502)",
      code: "provider_error",
      status: 502,
    });
    expect(sanitizeError("Bearer sk-live-secret request timed out")).toEqual({
      message: "Provider request timed out",
      code: "timeout",
      status: null,
    });
  });

  it("redacts URLs, bearer tokens, and sensitive key/value payloads", () => {
    expect(
      sanitizeText(
        "prompt: do not expose this https://provider.test/debug api_key=abc123"
      )
    ).toBe("prompt: [redacted]");
  });

  it("sanitizes nested workflow and notification diagnostics", () => {
    const result = JSON.parse(
      sanitizeRunStatsJson(
        JSON.stringify({
          steps: [
            {
              name: "notify",
              action: "skipped",
              reason: "url=https://x.test/a token=secret",
            },
          ],
          notifyReason: { telegram: { response: "raw", maxRank: 20 } },
        })
      )
    );
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("https://x.test/a");
    expect(JSON.stringify(result)).not.toContain("raw");
  });
});
