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

  // Incident: a two-channel notify reason (JSON, >240 chars) was sliced
  // mid-token, and the stats read-back parsed it again and got
  // "[json redacted]", hiding why Telegram was silent for 8h.
  const longReason = JSON.stringify({
    telegram: {
      digest: "already_sent",
      trending: "below_min_rank",
      maxRank: 12.34,
      budget: 1,
      localHour: 14,
      localDate: "2026-09-29",
    },
    "telegram-en": {
      digest: "already_sent",
      trending: "below_min_rank",
      maxRank: 11.02,
      budget: 1,
      localHour: 14,
      localDate: "2026-09-29",
      digestError: "x".repeat(400),
    },
  });

  it("truncates long JSON text structurally so it stays parseable", () => {
    const out = sanitizeText(longReason) as string;
    expect(out.length).toBeLessThanOrEqual(240);
    const parsed = JSON.parse(out);
    expect(parsed.telegram.trending).toMatch(/^below_mi/);
  });

  it("keeps a long JSON step reason readable through the stats double-sanitize", () => {
    const once = sanitizeRunStatsJson(
      JSON.stringify({ steps: [{ name: "notify", reason: longReason }] })
    );
    const twice = sanitizeRunStatsJson(once);
    const reason = JSON.parse(twice).steps[0].reason as string;
    expect(reason).not.toBe("[json redacted]");
    expect(JSON.parse(reason).telegram.trending).toMatch(/^below_mi/);
  });

  it("parses JSON longer than the pre-bound window instead of redacting it", () => {
    const big = JSON.stringify({
      ok: true,
      items: Array.from({ length: 200 }, (_, i) => `item-${i}`),
    });
    expect(big.length).toBeGreaterThan(240 * 4);
    const out = sanitizeText(big) as string;
    expect(out.length).toBeLessThanOrEqual(240);
    expect(JSON.parse(out).ok).toBe(true);
  });

  it("still redacts sensitive keys when shrinking JSON", () => {
    const out = sanitizeText(
      JSON.stringify({ prompt: "secret".repeat(100), note: "n".repeat(400) })
    ) as string;
    expect(out).not.toContain("secret");
    expect(JSON.parse(out).prompt).toBe("[redacted]");
  });

  it("returns valid JSON even for a tiny limit", () => {
    const out = sanitizeText(longReason, 12) as string;
    expect(() => JSON.parse(out)).not.toThrow();
    expect(out.length).toBeLessThanOrEqual(12);
  });
});
