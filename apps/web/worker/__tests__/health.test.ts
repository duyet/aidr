import { describe, expect, it } from "vitest";
import {
  ALERT_COOLDOWN_MS,
  applyCooldown,
  evaluateHealth,
  type HealthInput,
  type PriorRun,
  parsePriorRun,
  TELEGRAM_QUIET_MS,
} from "../health.js";

const NOW = Date.UTC(2026, 8, 29, 7, 0, 0);
const HOUR = 3600 * 1000;

function input(patch: Partial<HealthInput> = {}): HealthInput {
  return {
    nowMs: NOW,
    localHour: 14,
    runError: null,
    steps: [
      { name: "fetch", action: "27 fetched" },
      { name: "tldr", action: "generated" },
    ],
    telegramLastPostMs: { telegram: NOW - HOUR },
    llm: { total: 10, failed: 1 },
    history: [],
    ...patch,
  };
}

const keys = (p: Partial<HealthInput>) =>
  evaluateHealth(input(p)).map((i) => i.key);

const tldrFailedRun: PriorRun = {
  startedAtMs: NOW - HOUR,
  steps: [{ name: "tldr", action: "skipped", reason: "LLM failed: timeout" }],
  alerts: [],
};

describe("evaluateHealth", () => {
  it("is quiet for a healthy run", () => {
    expect(keys({})).toEqual([]);
  });

  // The 8h Telegram silence went unnoticed: every run "succeeded".
  it("flags a Telegram channel silent for more than 8h in active hours", () => {
    const quiet = { telegram: NOW - TELEGRAM_QUIET_MS - 1 };
    expect(keys({ telegramLastPostMs: quiet })).toEqual([
      "telegram-quiet:telegram",
    ]);
    expect(
      keys({ telegramLastPostMs: { telegram: NOW - TELEGRAM_QUIET_MS } })
    ).toEqual([]);
  });

  it("does not flag a quiet channel overnight", () => {
    const quiet = { telegram: NOW - 10 * HOUR };
    expect(keys({ telegramLastPostMs: quiet, localHour: 3 })).toEqual([]);
  });

  it("flags only a run where more than half the LLM attempts failed", () => {
    expect(keys({ llm: { total: 10, failed: 6 } })).toEqual([
      "llm-failure-rate",
    ]);
    expect(keys({ llm: { total: 10, failed: 5 } })).toEqual([]);
    // Too few calls to judge.
    expect(keys({ llm: { total: 2, failed: 2 } })).toEqual([]);
  });

  it("flags TL;DR only after 3 failed runs in a row", () => {
    const failing = tldrFailedRun.steps;
    expect(keys({ steps: failing, history: [tldrFailedRun] })).toEqual([]);
    expect(
      keys({ steps: failing, history: [tldrFailedRun, tldrFailedRun] })
    ).toEqual(["tldr-failing"]);
    const ok: PriorRun = {
      ...tldrFailedRun,
      steps: [{ name: "tldr", action: "generated" }],
    };
    expect(
      keys({ steps: failing, history: [tldrFailedRun, ok, tldrFailedRun] })
    ).toEqual([]);
  });

  it("flags a failed step and a run error", () => {
    expect(
      keys({
        runError: "Provider request failed",
        steps: [{ name: "score", action: "failed", reason: "timeout" }],
      })
    ).toEqual(["run-error", "step-failed"]);
  });
});

describe("applyCooldown", () => {
  const issue = evaluateHealth(input({ llm: { total: 4, failed: 4 } }));

  it("suppresses a key that fired within the cooldown", () => {
    const history: PriorRun[] = [
      { startedAtMs: NOW - HOUR, steps: [], alerts: ["llm-failure-rate"] },
    ];
    expect(applyCooldown(issue, history, NOW)).toEqual([]);
  });

  it("re-alerts once the cooldown has passed", () => {
    const history: PriorRun[] = [
      {
        startedAtMs: NOW - ALERT_COOLDOWN_MS,
        steps: [],
        alerts: ["llm-failure-rate"],
      },
    ];
    expect(applyCooldown(issue, history, NOW)).toEqual(issue);
  });
});

describe("parsePriorRun", () => {
  it("reads steps and alerts, tolerating seconds and bad stats", () => {
    expect(
      parsePriorRun({
        started_at: 1_700_000_000,
        stats: JSON.stringify({
          steps: [{ name: "tldr", action: "generated" }, { bad: 1 }],
          alerts: ["step-failed", 3],
        }),
      })
    ).toEqual({
      startedAtMs: 1_700_000_000_000,
      steps: [{ name: "tldr", action: "generated" }],
      alerts: ["step-failed"],
    });
    expect(parsePriorRun({ started_at: null, stats: "{" })).toEqual({
      startedAtMs: null,
      steps: [],
      alerts: [],
    });
  });
});
