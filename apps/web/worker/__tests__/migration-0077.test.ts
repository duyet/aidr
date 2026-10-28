import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LATEST_RUN_SQL } from "../../src/lib/feed-freshness.js";
import {
  NOT_DRY_RUN_SQL,
  SELECT_RECENT_WORKFLOW_RUNS_SQL,
  WORKFLOW_RUN_STARTED_AT_ORDER_SQL,
} from "../workflow-run.js";

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);
const read = (name: string) =>
  readFileSync(path.join(migrationsDir, name), "utf8");

function db() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(read("0001_init.sql"));
  raw.exec(read("0012_workflow_run_stats.sql"));
  raw.exec(read("0077_workflow_runs_started_order.sql"));
  return raw;
}

function plan(raw: DatabaseSync, sql: string): string {
  return (
    raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]
  )
    .map((r) => r.detail)
    .join("\n");
}

describe("migration 0077_workflow_runs_started_order", () => {
  // ~500 latest-run reads a day each scanned and sorted all ~4.8k runs
  // because nothing indexed the epoch-normalizing ORDER BY expression.
  it.each([
    ["lastRun", LATEST_RUN_SQL],
    ["admin run list", SELECT_RECENT_WORKFLOW_RUNS_SQL],
    [
      "non-dry-run history",
      `SELECT started_at, stats FROM workflow_runs WHERE id != 'x' AND ${NOT_DRY_RUN_SQL} ORDER BY ${WORKFLOW_RUN_STARTED_AT_ORDER_SQL} DESC, id DESC LIMIT 5`,
    ],
  ])("walks the index with no sort for %s", (_name, sql) => {
    const p = plan(db(), sql);
    expect(p).toContain("USING INDEX idx_workflow_runs_started_order");
    expect(p).not.toContain("TEMP B-TREE");
  });

  it("still puts a newer seconds row above a legacy epoch-ms row (defect: ms rows pinned lastRun)", () => {
    const raw = db();
    raw.exec(`INSERT INTO workflow_runs (id, started_at) VALUES
      ('legacy-ms', 1756000000000), ('newer-s', 1760000000), ('older-s', 1700000000)`);
    const ids = raw
      .prepare(SELECT_RECENT_WORKFLOW_RUNS_SQL)
      .all()
      .map((r) => (r as { id: string }).id);
    expect(ids).toEqual(["newer-s", "legacy-ms", "older-s"]);
  });
});
