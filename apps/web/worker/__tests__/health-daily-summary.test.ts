import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

vi.mock("../bugsink.js", () => ({
  reportPipelineException: vi.fn(async () => {}),
}));

import { readDailySummary } from "../health.js";
import type { Env } from "../types.js";

const NOW = Date.UTC(2026, 9, 14, 3, 0, 0);
const MODEL = "poolside/laguna-s-2.1";

function envWith(runs: { id: string; stats: object; itemsNew: number }[]) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE workflow_runs (id TEXT, started_at INTEGER,
      error TEXT, items_new INTEGER, stats TEXT);
    CREATE TABLE notifications (channel TEXT, status TEXT, posted_at INTEGER);
    CREATE TABLE llm_calls (model TEXT, ok INTEGER, error_status INTEGER, ts INTEGER);`);
  for (const run of runs)
    db.prepare("INSERT INTO workflow_runs VALUES (?, ?, NULL, ?, ?)").run(
      run.id,
      Math.floor(NOW / 1000) - 3600,
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
});
