import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

vi.mock("../bugsink.js", () => ({
  reportPipelineException: vi.fn(async () => {}),
}));

import { readDailySummary } from "../health.js";
import type { Env } from "../types.js";

const NOW = Date.UTC(2026, 9, 14, 3, 0, 0);
const MODEL = "poolside/laguna-s-2.1";

function envWith(
  runs: { id: string; stats: object; itemsNew: number; startedAt?: number }[]
) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE workflow_runs (id TEXT, started_at INTEGER,
      error TEXT, items_new INTEGER, stats TEXT);
    CREATE TABLE notifications (channel TEXT, status TEXT, posted_at INTEGER);
    CREATE TABLE llm_calls (model TEXT, ok INTEGER, error_status INTEGER, error_code TEXT, ts INTEGER);`);
  for (const run of runs)
    db.prepare("INSERT INTO workflow_runs VALUES (?, ?, NULL, ?, ?)").run(
      run.id,
      run.startedAt ?? Math.floor(NOW / 1000) - 3600,
      run.itemsNew,
      JSON.stringify(run.stats)
    );
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          all: async () => ({
            results: db.prepare(sql).all(...(args as never[])),
          }),
        }),
      }),
    },
  } as unknown as Env;
}

describe("readDailySummary", () => {
  // A dry run still translates and writes D1 (ALGORITHM.md "Dry runs"), so
  // its stats carry a viEnglish tally and its items_new counts. The summary
  // is the owner's picture of live traffic and must not include it.
  it("leaves dry runs out of the run, item, English and warning counts", async () => {
    const env = envWith([
      {
        id: "live",
        itemsNew: 4,
        stats: { viEnglish: { [MODEL]: { translated: 10, english: 1 } } },
      },
      {
        id: "dry",
        itemsNew: 30,
        stats: {
          mode: "dry-run",
          viEnglish: { [MODEL]: { translated: 30, english: 20 } },
          alerts: ["step-failed"],
        },
      },
    ]);
    const summary = await readDailySummary(env, NOW, "2026-10-14");
    expect(summary.runsOk).toBe(1);
    expect(summary.itemsNew).toBe(4);
    expect(summary.viEnglish).toEqual({
      [MODEL]: { translated: 10, english: 1 },
    });
    expect(summary.warnings).toEqual({});
  });

  // Production still holds 279 runs from 2026-08 with started_at in epoch
  // ms. A raw `started_at >= <seconds>` keeps every one of them inside
  // "the last 24h", so each daily DM claimed 279 extra runs and 710 extra
  // new items.
  it("leaves out an old run whose started_at is in epoch milliseconds", async () => {
    const env = envWith([
      { id: "live", itemsNew: 4, stats: {} },
      {
        id: "legacy-ms",
        itemsNew: 30,
        stats: {},
        startedAt: Date.UTC(2026, 7, 20),
      },
    ]);
    const summary = await readDailySummary(env, NOW, "2026-10-14");
    expect(summary.runsOk).toBe(1);
    expect(summary.itemsNew).toBe(4);
  });

  it("counts a run from the last 24h stored in epoch milliseconds", async () => {
    const env = envWith([
      { id: "recent-ms", itemsNew: 5, stats: {}, startedAt: NOW - 3600_000 },
    ]);
    const summary = await readDailySummary(env, NOW, "2026-10-14");
    expect(summary.runsOk).toBe(1);
    expect(summary.itemsNew).toBe(5);
  });
});
