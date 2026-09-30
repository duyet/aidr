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

  // A silent channel went unnoticed: every run "succeeded". The bar is a
  // missed daily digest, because on a usual day the digest is the only post
  // (2026-09-30: an 8h bar fired while the pipeline was healthy).
  it("flags a Telegram channel that missed its daily digest", () => {
    expect(TELEGRAM_QUIET_MS).toBeGreaterThan(24 * HOUR);
    const quiet = { telegram: NOW - TELEGRAM_QUIET_MS - 1 };
    expect(keys({ telegramLastPostMs: quiet })).toEqual([
      "telegram-quiet:telegram",
    ]);
    expect(
      keys({ telegramLastPostMs: { telegram: NOW - TELEGRAM_QUIET_MS } })
    ).toEqual([]);
  });

  it("does not flag a quiet channel overnight", () => {
    const quiet = { telegram: NOW - TELEGRAM_QUIET_MS - HOUR };
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

  it("flags a step that failed while the run succeeded", () => {
    expect(
      keys({
        steps: [{ name: "score", action: "failed", reason: "timeout" }],
      })
    ).toEqual(["step-failed"]);
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
