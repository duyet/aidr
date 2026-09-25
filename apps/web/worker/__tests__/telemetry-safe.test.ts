import { describe, expect, it } from "vitest";
import {
  sanitizeError,
  sanitizeRunStatsJson,
  sanitizeText,
} from "../telemetry-safe.js";

describe("telemetry-safe", () => {
  it("returns structured safe provider errors without response bodies", () => {
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
    expect(sanitizeError("anyrouter response missing content")).toEqual({
      message: "Provider returned an invalid response",
      code: "invalid_response",
      status: null,
    });
    expect(sanitizeError("Provider request failed (502)")).toEqual({
      message: "Provider request failed (502)",
      code: "provider_error",
      status: 502,
    });
  });

  it("redacts URLs, bearer tokens, and sensitive key/value payloads", () => {
    expect(
      sanitizeText(
        "prompt: do not expose this https://provider.test/debug api_key=abc123"
      )
    ).toBe("prompt: [redacted]");
  });

  it("sanitizes nested step and notification reasons", () => {
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
    expect(result.steps[0].reason).toBe("url=[url redacted] token: [redacted]");
    expect(result.notifyReason.telegram).toEqual({
      response: "[redacted]",
      maxRank: 20,
    });
  });

  it("redacts JSON payloads embedded in text", () => {
    expect(
      sanitizeText('{"prompt":"secret","url":"https://x.test","ok":true}')
    ).toBe('{"prompt":"[redacted]","url":"[url redacted]","ok":true}');
  });

  it("drops malformed stats rather than returning raw JSON", () => {
    expect(sanitizeRunStatsJson('{"prompt":"secret"')).toBe("{}");
  });
});
