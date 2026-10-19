#!/usr/bin/env tsx
/**
 * Read-only replay of a cross-run circuit breaker over production
 * `llm_calls` (SELECT only, 7-day retention). Prints, per task and model,
 * how many attempts the breaker would have skipped, how many of those had
 * actually been served, and the seconds it would have saved.
 *
 * Usage (from repo root):
 *   pnpm --filter @aidr/web llm-breaker-replay [--since 2026-10-15]
 *     [--streak 3] [--cooldown-min 15] [--window-min 30] [--cache <file>]
 *
 * Rule: a task+model opens after `--streak` failures in a row, or when more
 * than half of its last 10 attempts in `--window-min` failed (at least 5).
 * While open its attempts are skipped; the first one after the cooldown is
 * the probe. 429 rows are left out: the 2-minute 429 skip already covers
 * them and never fails open.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { wranglerSelect } from "./cf-d1";

interface Attempt {
  ts: number;
  task: string;
  model: string;
  ok: number;
  error_status: number | null;
  duration_ms: number | null;
}

/** Score asks these through `/systemone`, not `callAnyrouter`, so a chat
 *  chain breaker never sees them. */
const SYSTEM_ONE_IDS = new Set(["typesafe/jev", "anyrouter/decision"]);

const { values } = parseArgs({
  options: {
    since: { type: "string" },
    streak: { type: "string", default: "3" },
    "cooldown-min": { type: "string", default: "15" },
    "window-min": { type: "string", default: "30" },
    cache: { type: "string" },
  },
});
const streakLimit = Number(values.streak);
const cooldownMs = Number(values["cooldown-min"]) * 60_000;
const windowMs = Number(values["window-min"]) * 60_000;
const sinceMs = values.since ? Date.parse(`${values.since}T00:00:00Z`) : 0;

function loadAttempts(): Attempt[] {
  if (values.cache && existsSync(values.cache))
    return JSON.parse(readFileSync(values.cache, "utf8")) as Attempt[];
  const rows = wranglerSelect(
    "SELECT ts, task, model, ok, error_status, duration_ms FROM llm_calls ORDER BY ts, id"
  ) as unknown as Attempt[];
  if (values.cache) writeFileSync(values.cache, JSON.stringify(rows));
  return rows;
}

interface Breaker {
  recent: { ts: number; ok: boolean }[];
  streak: number;
  openUntil: number | null;
  opens: number;
  skipped: number;
  skippedServed: number;
  savedMs: number;
}

const breakers = new Map<string, Breaker>();
const attempts = loadAttempts().filter(
  (a) => a.ts >= sinceMs && a.error_status !== 429
);

for (const a of attempts) {
  const key = `${a.task} ${a.model}`;
  let b = breakers.get(key);
  if (!b) {
    b = {
      recent: [],
      streak: 0,
      openUntil: null,
      opens: 0,
      skipped: 0,
      skippedServed: 0,
      savedMs: 0,
    };
    breakers.set(key, b);
  }
  if (b.openUntil !== null && a.ts < b.openUntil) {
    b.skipped++;
    if (a.ok) b.skippedServed++;
    b.savedMs += a.duration_ms ?? 0;
    continue;
  }
  b.openUntil = null;
  b.recent = [...b.recent, { ts: a.ts, ok: a.ok === 1 }]
    .filter((r) => a.ts - r.ts <= windowMs)
    .slice(-10);
  b.streak = a.ok ? 0 : b.streak + 1;
  const failed = b.recent.filter((r) => !r.ok).length;
  const tripped =
    b.streak >= streakLimit ||
    (b.recent.length >= 5 && failed / b.recent.length > 0.5);
  if (!a.ok && tripped) {
    b.openUntil = a.ts + cooldownMs;
    b.opens++;
    b.recent = [];
    b.streak = 0;
  }
}

const rows = [...breakers.entries()]
  .filter(([, b]) => b.opens > 0)
  .sort(([, x], [, y]) => y.skipped - x.skipped);
const chat = rows.filter(([key]) => !SYSTEM_ONE_IDS.has(key.split(" ")[1]));
const sum = (list: typeof rows, pick: (b: Breaker) => number) =>
  list.reduce((total, [, b]) => total + pick(b), 0);

console.log(
  `${attempts.length} non-429 attempts since ${values.since ?? "the oldest row"}`
);
for (const [key, b] of rows)
  console.log(
    `${key.padEnd(48)} opens=${b.opens} skipped=${b.skipped} served=${b.skippedServed} saved=${Math.round(b.savedMs / 1000)}s`
  );
console.log(
  `chat chains: skipped ${sum(chat, (b) => b.skipped)}, of which ${sum(chat, (b) => b.skippedServed)} were served, saved ${Math.round(sum(chat, (b) => b.savedMs) / 1000)}s`
);
console.log(
  `all ids:     skipped ${sum(rows, (b) => b.skipped)}, of which ${sum(rows, (b) => b.skippedServed)} were served, saved ${Math.round(sum(rows, (b) => b.savedMs) / 1000)}s`
);
