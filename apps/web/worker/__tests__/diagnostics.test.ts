import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildDiagnosticsReport,
  DIAGNOSTICS_ALERT_RUNS_SQL,
  DIAGNOSTICS_RUNS_SQL,
  type RunRow,
  stuckQueueCountSql,
} from "../diagnostics.js";
import {
  buildMissingEnSummaryQuery,
  EN_SUMMARY_NO_TEXT_COUNT_SQL,
  EN_SUMMARY_UPDATE_SQL,
} from "../en-summary.js";

const MIN = 60 * 1000;
const NOW = Date.UTC(2026, 9, 17, 7, 0);
const sec = (ms: number) => Math.floor(ms / 1000);

const STUCK = {
  enSummaryNoText: 0,
  enSummaryOver24h: 0,
  translateOver24h: 0,
  unscoredOver24h: 0,
};
const SOURCES = { health: {}, stale: [], failing: [] };
const UNCONFIGURED = {
  status: "unconfigured",
  reason: "CF_ANALYTICS_API_TOKEN unset",
} as const;

function run(
  id: string,
  startedMinAgo: number,
  opts: {
    closed?: boolean;
    error?: string;
    steps?: { name: string; action: string; reason?: string }[];
    alerts?: string[];
    durationMin?: number;
  } = {}
): RunRow {
  const started = NOW - startedMinAgo * MIN;
  const steps = [
    ...(opts.steps ?? []),
    ...(opts.closed === false ? [] : [{ name: "close-run", action: "closed" }]),
  ];
  return {
    id,
    started_at: sec(started),
    finished_at:
      opts.closed === false
        ? sec(started)
        : sec(started + (opts.durationMin ?? 5) * MIN),
    items_fetched: 10,
    items_new: 2,
    error: opts.error ?? null,
    stats: JSON.stringify({ steps, alerts: opts.alerts ?? [] }),
  };
}

function report(runs: RunRow[], alertRuns: RunRow[] = runs) {
  return buildDiagnosticsReport({
    nowMs: NOW,
    runs,
    alertRuns,
    sources: SOURCES,
    stuck: STUCK,
    traffic: UNCONFIGURED,
  });
}

describe("buildDiagnosticsReport ingest", () => {
  it("calls the newest run stuck once it is unfinished past the 25-minute window", () => {
    const result = report([
      run("open", 26, { closed: false }),
      run("done", 56),
    ]);
    expect(result.verdicts.ingest).toBe("stuck");
    expect(result.ingest.stuckRun).toEqual({
      id: "open",
      startedAt: new Date(NOW - 26 * MIN).toISOString(),
      ageMin: 26,
    });
    // Age of the newest finished run counts from when it finished.
    expect(result.ingest.newestFinishedAgeMin).toBe(51);
  });

  it("treats a run still inside the window as running, not stuck", () => {
    const result = report([
      run("open", 20, { closed: false }),
      run("done", 50),
    ]);
    expect(result.ingest.stuckRun).toBeNull();
    expect(result.verdicts.ingest).toBe("fresh");
    expect(result.runs[0].finishedAt).toBeNull();
  });

  it("is late when the newest finished run ended over 2h ago", () => {
    expect(report([run("done", 200)]).verdicts.ingest).toBe("late");
    expect(report([]).verdicts.ingest).toBe("none");
  });
});

describe("buildDiagnosticsReport last run", () => {
  it("is degraded when a step reported a failure, and lists only that step", () => {
    const result = report([
      run("r", 10, {
        steps: [
          { name: "fetch", action: "fetched 40" },
          { name: "tldr", action: "tldr failed", reason: "timeout" },
        ],
      }),
    ]);
    expect(result.verdicts.lastRun).toBe("degraded");
    expect(result.runs[0].failedSteps).toEqual(["tldr: tldr failed (timeout)"]);
  });

  it("is failed when the run recorded an error", () => {
    expect(report([run("r", 10, { error: "boom" })]).verdicts.lastRun).toBe(
      "failed"
    );
  });

  it("never echoes a URL query string from a run error", () => {
    const secret = ["sk", "live", "abc123"].join("_");
    const result = report([
      run("r", 10, {
        error: `fetch https://api.example.com/v1?key=${secret} returned 500`,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe("buildDiagnosticsReport alerts", () => {
  it("opens keys fired in the last 24h and leaves markers out", () => {
    const result = report(
      [],
      [
        run("a", 30, { alerts: ["traffic-low", "daily-summary:2026-10-17"] }),
        run("b", 23 * 60, { alerts: ["step-failed"] }),
        run("c", 30 * 60, { alerts: ["tldr-failing"] }),
        run("d", 40),
      ]
    );
    expect(result.verdicts.openAlerts).toEqual(["step-failed", "traffic-low"]);
    expect(result.alerts.map((a) => [a.runId, a.keys])).toEqual([
      ["a", ["traffic-low"]],
      ["b", ["step-failed"]],
      ["c", ["tldr-failing"]],
    ]);
  });

  it("sums the retrying stuck counts, leaving settled no-text rows out", () => {
    const result = buildDiagnosticsReport({
      nowMs: NOW,
      runs: [],
      alertRuns: [],
      sources: SOURCES,
      stuck: {
        ...STUCK,
        enSummaryNoText: 5,
        enSummaryOver24h: 1,
        translateOver24h: 2,
      },
      traffic: UNCONFIGURED,
    });
    expect(result.verdicts.stuckRows).toBe(3);
    expect(result.verdicts.traffic).toBe("unconfigured");
  });
});

describe("diagnostics SQL on SQLite", () => {
  function runsDb(): DatabaseSync {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE workflow_runs (
      id TEXT PRIMARY KEY, started_at INTEGER, finished_at INTEGER,
      items_fetched INTEGER, items_new INTEGER, error TEXT, stats TEXT)`);
    const insert = sqlite.prepare(
      "INSERT INTO workflow_runs VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const r of [
      run("live", 10, { alerts: ["traffic-low"] }),
      {
        ...run("dry", 5, { alerts: ["step-failed"] }),
        stats: JSON.stringify({ mode: "dry-run", alerts: ["step-failed"] }),
      },
      run("old", 50 * 60, { alerts: ["tldr-failing"] }),
    ]) {
      insert.run(
        r.id,
        r.started_at as number,
        r.finished_at as number,
        r.items_fetched,
        r.items_new,
        r.error as string | null,
        r.stats as string
      );
    }
    return sqlite;
  }

  it("lists live runs only and reads alerts within the window", () => {
    const sqlite = runsDb();
    const runs = sqlite
      .prepare(DIAGNOSTICS_RUNS_SQL)
      .all() as unknown as RunRow[];
    expect(runs.map((r) => r.id)).toEqual(["live", "old"]);
    const alertRuns = sqlite
      .prepare(DIAGNOSTICS_ALERT_RUNS_SQL)
      .all(sec(NOW - 48 * 60 * MIN)) as unknown as RunRow[];
    expect(report(runs, alertRuns).alerts).toEqual([
      {
        runId: "live",
        at: new Date(NOW - 10 * MIN).toISOString(),
        keys: ["traffic-low"],
      },
    ]);
  });

  it("counts en-summary rows marked as no text and queue rows older than 24h", () => {
    const migrations = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../migrations"
    );
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE items (
      id TEXT PRIMARY KEY, title TEXT, summary TEXT, status TEXT,
      source_lang TEXT NOT NULL DEFAULT 'en', published_at INTEGER,
      fetched_at INTEGER, source_revision INTEGER NOT NULL DEFAULT 0)`);
    sqlite.exec(
      readFileSync(path.join(migrations, "0055_items_summary_en.sql"), "utf8")
    );
    const insert = sqlite.prepare(
      "INSERT INTO items (id, title, summary, status, published_at, fetched_at) VALUES (?, 'T', ?, 'published', ?, ?)"
    );
    const hoursAgo = (h: number) => sec(NOW) - h * 3600;
    insert.run("old", "Old story.", hoursAgo(30), hoursAgo(30));
    insert.run("new", "New story.", hoursAgo(1), hoursAgo(1));
    // An upstream date a day old on a row fetched an hour ago is waiting
    // for its first run, not stuck.
    insert.run("late", "Late story.", hoursAgo(30), hoursAgo(1));
    insert.run("byline", "By Jane Doe / Fortune.", hoursAgo(30), hoursAgo(30));
    sqlite.prepare(EN_SUMMARY_UPDATE_SQL).run("", 0, "byline", 0);

    expect(sqlite.prepare(EN_SUMMARY_NO_TEXT_COUNT_SQL).get()).toEqual({
      n: 1,
    });
    expect(
      sqlite
        .prepare(stuckQueueCountSql(buildMissingEnSummaryQuery(1000)))
        .get(sec(NOW) - 24 * 3600)
    ).toEqual({ n: 1 });
  });
});
