import { describe, expect, it, vi } from "vitest";

/**
 * The granular /api/system/* loaders exist to turn the old monolithic
 * stats query into one batched D1 round-trip per section. These tests pin
 * the two properties that make that safe:
 *
 * - every section's reads go through a single db.batch() (statements
 *   awaited outside batch are sequential round-trips — only probes and
 *   explicit run-id LLM lookups are allowed there), and
 * - optional columns/tables behind later migrations (items.llm_tokens,
 *   workflow_runs.stats, llm_calls) degrade to empty sections instead of
 *   aborting the whole batch — a D1 batch fails wholesale on one bad
 *   statement, which is why probes stay out of it.
 */

type Stub = {
  first?: () => unknown;
  all?: () => unknown;
};

/** D1 fake that records which statements ran sequentially (directAlls),
 * which ran inside each db.batch call, and every bind() — so tests can
 * assert "one round-trip" rather than trusting it. */
function makeDb(stubs: Record<string, Stub>) {
  const directAlls: string[] = [];
  const batches: string[][] = [];
  const binds: { sql: string; args: unknown[] }[] = [];

  const prepare = (sql: string) => {
    const key = Object.keys(stubs).find((k) => sql.includes(k));
    const stub: Stub = (key ? stubs[key] : {}) ?? {};
    const runAll = () =>
      Promise.resolve().then(
        () => (stub.all?.() as { results?: unknown[] }) ?? { results: [] }
      );
    const stmt = {
      sql,
      bind: (...args: unknown[]) => {
        binds.push({ sql, args });
        return stmt;
      },
      first: () => Promise.resolve().then(() => stub.first?.() ?? null),
      all: () => {
        directAlls.push(sql);
        return runAll();
      },
      // batch() resolves through this so batch statements don't count
      // as sequential round-trips.
      batchedAll: runAll,
    };
    return stmt;
  };

  const db = {
    prepare,
    batch: (stmts: { sql: string; batchedAll: () => Promise<unknown> }[]) => {
      batches.push(stmts.map((s) => s.sql));
      return Promise.all(stmts.map((s) => s.batchedAll()));
    },
  } as unknown as D1Database;

  return { db, directAlls, batches, binds };
}

/** probeSystemTables caches its migration flags in module scope ("once
 * per isolate"), so each test re-imports to choose its own probe outcome. */
async function freshQueries() {
  vi.resetModules();
  return import("./system-queries");
}

const RUN_ROW = {
  id: "run-1",
  started_at: 1_700_000_000,
  finished_at: 1_700_000_060,
  items_fetched: 5,
  items_new: 2,
  error: null,
  stats: '{"bySource":{"hn":3},"tokens":120}',
};

/** llm_calls stores newest-first; the explicit run-id query orders it
 * chronologically for the selected run. */
const LLM_CALL_ROWS_NEWEST_FIRST = [
  {
    ts: 1_700_000_030_000,
    run_id: "run-1",
    task: "score",
    model: "anyrouter/auto",
    ok: 0,
    tokens: null,
    duration_ms: 4000,
    prompt_chars: 100,
    error: "timeout",
    error_code: "timeout",
    error_status: null,
    prompt_tokens: null,
    completion_tokens: null,
    cached_tokens: null,
  },
  {
    ts: 1_700_000_010_000,
    run_id: "run-1",
    task: "score",
    model: "anyrouter/auto",
    ok: 1,
    tokens: 100,
    duration_ms: 1200,
    prompt_chars: 40,
    error: null,
    prompt_tokens: 80,
    completion_tokens: 20,
    cached_tokens: 10,
  },
];

describe("loadSystemOverview", () => {
  it("returns headline numbers from a single batched round-trip", async () => {
    const q = await freshQueries();
    const todayRun = {
      ...RUN_ROW,
      id: "run-today",
      started_at: Math.floor(Date.now() / 1000) - 30,
      finished_at: Math.floor(Date.now() / 1000),
    };
    const { db, directAlls, batches } = makeDb({
      "COUNT(*) AS c FROM items": { all: () => ({ results: [{ c: 42 }] }) },
      "COUNT(*) AS c FROM translations": {
        all: () => ({ results: [{ c: 7 }] }),
      },
      "COUNT(*) AS c FROM tldr_snapshots": {
        all: () => ({ results: [{ c: 3 }] }),
      },
      "COUNT(*) AS c FROM subscribers": {
        all: () => ({ results: [{ c: 9 }] }),
      },
      "COUNT(*) AS c FROM sources": { all: () => ({ results: [{ c: 4 }] }) },
      "COUNT(*) AS c FROM item_sources": {
        all: () => ({ results: [{ c: 55 }] }),
      },
      "FROM workflow_runs ORDER BY": {
        all: () => ({ results: [RUN_ROW, todayRun] }),
      },
      "date FROM tldr_snapshots": {
        all: () => ({ results: [{ date: "2026-01-02" }] }),
      },
      "SUM(llm_tokens) AS s": { all: () => ({ results: [{ s: 1200 }] }) },
      "AVG(llm_tokens)": { all: () => ({ results: [{ a: 24.6 }] }) },
    });

    const o = await q.loadSystemOverview(db);

    expect(o.totals).toEqual({
      items: 42,
      translations: 7,
      tldrSnapshots: 3,
      subscribers: 9,
      sources: 4,
      itemSourcesRows: 55,
    });
    expect(o.tokens).toEqual({ total: 1200, avgPerItem: 25 });
    expect(o.lastRun?.id).toBe("run-1");
    expect(o.lastRun?.stats).toEqual({ bySource: { hn: 3 }, tokens: 120 });
    expect(o.runsToday).toBe(1);
    expect(o.latestTldrDate).toBe("2026-01-02");

    // One batch, all ten statements in it; the only sequential queries
    // were the three migration probes.
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(10);
    expect(directAlls).toHaveLength(3);
    expect(directAlls.every((s) => s.includes("LIMIT 1"))).toBe(true);
  });

  it("runs the migration probes once per isolate, not per request", async () => {
    const q = await freshQueries();
    const { db, directAlls, batches } = makeDb({});

    await q.loadSystemOverview(db);
    await q.loadSystemOverview(db);

    expect(batches).toHaveLength(2);
    expect(directAlls).toHaveLength(3);
  });

  it("omits token statements when the llm_tokens column is not migrated", async () => {
    const q = await freshQueries();
    const { db, batches } = makeDb({
      "llm_tokens FROM items LIMIT 1": {
        all: () => {
          throw new Error("no such column: llm_tokens");
        },
      },
    });

    const o = await q.loadSystemOverview(db);

    expect(o.tokens).toEqual({ total: 0, avgPerItem: 0 });
    // The failed probe keeps migration-gated statements out of the batch
    // — otherwise one missing column would 500 the whole endpoint.
    expect(batches[0]).toHaveLength(8);
    expect(batches[0]?.some((s) => s.includes("llm_tokens"))).toBe(false);
  });
});

describe("loadSystemActivity", () => {
  it("loads the four distribution lists in one batch with no probes", async () => {
    const q = await freshQueries();
    const { db, directAlls, batches } = makeDb({
      "GROUP BY status": {
        all: () => ({ results: [{ name: "published", count: 10 }] }),
      },
      "GROUP BY source_id": {
        all: () => ({ results: [{ name: "hn", count: 8 }] }),
      },
      "COALESCE(category": {
        all: () => ({ results: [{ name: "papers", count: 5 }] }),
      },
      "date(published_at": {
        all: () => ({ results: [{ date: "2026-01-01", count: 2 }] }),
      },
    });

    const a = await q.loadSystemActivity(db);

    expect(a.itemsByStatus).toEqual([{ name: "published", count: 10 }]);
    expect(a.itemsBySource).toEqual([{ name: "hn", count: 8 }]);
    expect(a.itemsByCategory).toEqual([{ name: "papers", count: 5 }]);
    expect(a.itemsPerDay).toEqual([{ date: "2026-01-01", count: 2 }]);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(4);
    // Nothing here is migration-gated — no probe round-trips at all.
    expect(directAlls).toHaveLength(0);
  });
});

describe("loadSystemRuns", () => {
  /** The two GROUP BY queries the aggregated list path issues for run-1. */
  const RUN_1_AGGREGATE = {
    run_id: "run-1",
    calls: 2,
    failures: 1,
    tokens: 100,
    duration_ms: 5200,
    cached_sum: 10,
    cached_known: 1,
  };
  const RUN_1_MODEL = { run_id: "run-1", model: "anyrouter/auto" };

  function runsDb(stubs: Record<string, Stub> = {}) {
    return makeDb({
      "FROM workflow_runs ORDER BY": {
        all: () => ({ results: [RUN_ROW] }),
      },
      "MIN(ts) AS first_ts": { all: () => ({ results: [RUN_1_MODEL] }) },
      "COUNT(*) AS calls": { all: () => ({ results: [RUN_1_AGGREGATE] }) },
      ...stubs,
    });
  }

  it("aggregates per-run usage in SQL and never inlines per-call rows", async () => {
    const q = await freshQueries();
    const { db, binds } = runsDb();

    const runs = await q.loadSystemRuns(db);
    const llm = runs[0]?.llm;

    // Aggregates survive — the run row still shows burn/failures.
    expect(llm?.calls).toBe(2);
    expect(llm?.failures).toBe(1);
    expect(llm?.tokens).toBe(100);
    expect(llm?.cachedTokens).toBe(10);
    expect(llm?.durationMs).toBe(5200);
    expect(llm?.models).toEqual(["anyrouter/auto"]);
    // The list payload never carries per-attempt rows (run-attempts serves
    // them lazily on expand), and an aggregated summary is never truncated.
    expect(llm?.attempts).toEqual([]);
    expect(llm?.truncated).toBeUndefined();

    // Attribution is by explicit run id, never by a timestamp window.
    const runBind = binds.find((b) => b.sql.includes("run_id IN"));
    expect(runBind?.args).toEqual(["run-1"]);
  });

  it("never issues a row-level SELECT over llm_calls", async () => {
    const q = await freshQueries();
    const { db, directAlls } = runsDb();

    await q.loadSystemRuns(db);

    // A shared row cap is what starved the newest runs before; the list path
    // must not read rows at all.
    const rowReads = directAlls.filter(
      (s) => s.includes("FROM llm_calls") && s.includes("SELECT ts, run_id")
    );
    expect(rowReads).toHaveLength(0);
  });

  it("issues no row cap on the llm_calls aggregate queries", async () => {
    const q = await freshQueries();
    const { db, directAlls } = runsDb();

    await q.loadSystemRuns(db);

    // Scope to the two GROUP BY queries: the `SELECT … FROM llm_calls LIMIT 1`
    // capability probes are one-row schema checks, and the 30-row cap on
    // `workflow_runs` is the intended list size, not a truncation.
    const aggregates = directAlls.filter(
      (s) => s.includes("FROM llm_calls") && s.includes("GROUP BY run_id")
    );
    expect(aggregates).toHaveLength(2);
    expect(aggregates.filter((s) => /LIMIT\s+\d/i.test(s))).toEqual([]);
  });

  it("reports unknown cached usage as null rather than zero", async () => {
    const q = await freshQueries();
    const { db } = runsDb({
      "COUNT(*) AS calls": {
        all: () => ({
          results: [{ ...RUN_1_AGGREGATE, cached_known: 0, cached_sum: null }],
        }),
      },
    });

    expect((await q.loadSystemRuns(db))[0]?.llm?.cachedTokens).toBeNull();
  });

  it("omits the summary entirely for a run with no attributed calls", async () => {
    const q = await freshQueries();
    const { db } = runsDb({
      "COUNT(*) AS calls": { all: () => ({ results: [] }) },
      "MIN(ts) AS first_ts": { all: () => ({ results: [] }) },
    });

    // No `llm` key at all, so the UI can still say "unattributed" rather
    // than claiming a run that made zero calls.
    expect((await q.loadSystemRuns(db))[0]?.llm).toBeUndefined();
  });

  it("ignores a model row whose run id is not safely echoable", async () => {
    const q = await freshQueries();
    const { db } = runsDb({
      "MIN(ts) AS first_ts": {
        all: () => ({
          results: [
            { run_id: "run-1", model: "anyrouter/auto" },
            { run_id: "bad id/../x", model: "evil/model" },
          ],
        }),
      },
    });

    expect((await q.loadSystemRuns(db))[0]?.llm?.models).toEqual([
      "anyrouter/auto",
    ]);
  });

  it("returns plain runs when llm_calls does not exist yet", async () => {
    const q = await freshQueries();
    const { db, directAlls } = makeDb({
      "ts FROM llm_calls LIMIT 1": {
        all: () => {
          throw new Error("no such table: llm_calls");
        },
      },
      "FROM workflow_runs ORDER BY": {
        all: () => ({ results: [RUN_ROW] }),
      },
    });

    const runs = await q.loadSystemRuns(db);

    expect(runs[0]?.id).toBe("run-1");
    expect(runs[0]?.llm).toBeUndefined();
    // The failed probe also skips the identity query entirely.
    expect(directAlls.some((s) => s.includes("run_id IN"))).toBe(false);
  });

  it("degrades to plain runs when the llm window query fails", async () => {
    const q = await freshQueries();
    // Probe succeeds (table exists) but both window SELECTs fail —
    // llm detail is best-effort and must not 500 the runs endpoint.
    const { db } = makeDb({
      "run_id IN": {
        all: () => {
          throw new Error("deadline exceeded");
        },
      },
      "FROM workflow_runs ORDER BY": {
        all: () => ({ results: [RUN_ROW] }),
      },
    });

    const runs = await q.loadSystemRuns(db);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.llm).toBeUndefined();
  });
});

describe("loadRunAttempts", () => {
  const RUN_ID = "run-1";

  it("returns chronological attempts bound only to the requested run id", async () => {
    const q = await freshQueries();
    const { db, binds } = makeDb({
      "run_id = ?": {
        all: () => ({ results: LLM_CALL_ROWS_NEWEST_FIRST }),
      },
    });

    const result = await q.loadRunAttempts(db, RUN_ID);

    expect(result.status).toBe("ready");
    expect(result.attempts.map((a) => a.ts)).toEqual([
      1_700_000_010_000, 1_700_000_030_000,
    ]);
    const runBind = binds.find((b) => b.sql.includes("run_id = ?"));
    expect(runBind?.args).toEqual([RUN_ID]);
    expect(runBind?.sql).not.toContain("ts >=");
    expect(runBind?.sql).not.toContain("ts <=");
  });

  it("reports unavailable without querying when identity is not migrated", async () => {
    const q = await freshQueries();
    const { db, directAlls } = makeDb({
      "ts FROM llm_calls LIMIT 1": {
        all: () => ({ results: [] }),
      },
      "run_id FROM llm_calls LIMIT 1": {
        all: () => {
          throw new Error("no such column: run_id");
        },
      },
    });

    expect(await q.loadRunAttempts(db, RUN_ID)).toEqual({
      attempts: [],
      status: "unavailable",
      truncated: false,
    });
    expect(directAlls.some((s) => s.includes("run_id = ?"))).toBe(false);
  });

  it("falls back to the pre-0016 usage column set when usage columns are missing", async () => {
    const q = await freshQueries();
    const { db } = makeDb({
      // First SELECT (with prompt_tokens etc.) fails on a pre-0016 DB;
      // the retry without usage columns must still serve attempts.
      prompt_tokens: {
        all: () => {
          throw new Error("no such column: prompt_tokens");
        },
      },
      "run_id = ?": {
        all: () => ({
          results: [
            {
              ts: 1_700_000_010_000,
              run_id: RUN_ID,
              task: "score",
              model: "anyrouter/auto",
              ok: 1,
              tokens: 5,
              duration_ms: 10,
              prompt_chars: 3,
              error: null,
            },
          ],
        }),
      },
    });

    const result = await q.loadRunAttempts(db, RUN_ID);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.tokens).toBe(5);
    expect(result.attempts[0]?.promptTokens).toBeNull();
  });
});

describe("loadSystemLlm", () => {
  it("returns call volume and token burn from one batch", async () => {
    const q = await freshQueries();
    const { db, batches } = makeDb({
      "GROUP BY date, task": {
        all: () => ({
          results: [
            {
              date: "2026-01-01",
              task: "score",
              calls: 4,
              failures: 1,
              tokens: 300,
            },
            {
              date: "2026-01-01",
              task: "tldr",
              calls: 1,
              failures: 0,
              tokens: null,
            },
          ],
        }),
      },
      "SUM(llm_tokens) AS s": { all: () => ({ results: [{ s: 900 }] }) },
      "AVG(llm_tokens)": { all: () => ({ results: [{ a: 12.4 }] }) },
      "SUM(llm_tokens) AS count": {
        all: () => ({
          results: [
            { date: "2026-01-01", count: 700 },
            { date: "2026-01-02", count: null },
          ],
        }),
      },
    });

    const r = await q.loadSystemLlm(db);

    expect(r.llmCallsPerDay).toEqual([
      { date: "2026-01-01", task: "score", calls: 4, failures: 1, tokens: 300 },
      { date: "2026-01-01", task: "tldr", calls: 1, failures: 0, tokens: 0 },
    ]);
    expect(r.tokens).toEqual({
      total: 900,
      avgPerItem: 12,
      perDay: [
        { date: "2026-01-01", count: 700 },
        { date: "2026-01-02", count: 0 },
      ],
    });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(4);
  });

  it("returns empty sections without a batch on a pre-migration DB", async () => {
    const q = await freshQueries();
    const { db, batches } = makeDb({
      "LIMIT 1": {
        all: () => {
          throw new Error("no such column");
        },
      },
    });

    const r = await q.loadSystemLlm(db);

    expect(r.llmCallsPerDay).toEqual([]);
    expect(r.tokens).toEqual({ total: 0, avgPerItem: 0, perDay: [] });
    // Every statement was migration-gated, so there is nothing safe to
    // send — the endpoint must not issue a doomed round-trip.
    expect(batches).toHaveLength(0);
  });
});

describe("loadSystemSources", () => {
  it("maps source rows, lifetime volume, and the latest run's pull", async () => {
    const q = await freshQueries();
    const { db, batches } = makeDb({
      "LEFT JOIN items i": {
        all: () => ({
          results: [
            {
              id: "hn",
              name: "Hacker News",
              type: "hn",
              config: '{"query":"AI"}',
              enabled: 1,
              item_count: 12,
            },
            {
              id: "blog",
              name: "Blog",
              type: "rss",
              config: "not json",
              enabled: 0,
              item_count: 0,
            },
          ],
        }),
      },
      "GROUP BY source_id": {
        all: () => ({ results: [{ name: "hn", count: 30 }] }),
      },
      "FROM workflow_runs ORDER BY": {
        all: () => ({ results: [RUN_ROW] }),
      },
    });

    const s = await q.loadSystemSources(db);

    expect(s.ingestSources).toEqual([
      {
        id: "hn",
        name: "Hacker News",
        type: "hn",
        enabled: true,
        itemCount: 12,
        config: { query: "AI" },
      },
      // Malformed config JSON degrades to {} rather than failing the row.
      {
        id: "blog",
        name: "Blog",
        type: "rss",
        enabled: false,
        itemCount: 0,
        config: {},
      },
    ]);
    expect(s.volume).toEqual([{ name: "hn", count: 30 }]);
    expect(s.lastRunBySource).toEqual({ hn: 3 });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });

  it("reports lastRunBySource undefined when the stats column is missing", async () => {
    const q = await freshQueries();
    const { db } = makeDb({
      "stats FROM workflow_runs LIMIT 1": {
        all: () => {
          throw new Error("no such column: stats");
        },
      },
      "FROM workflow_runs ORDER BY": {
        all: () => ({
          results: [
            {
              id: "run-old",
              started_at: 1_700_000_000,
              finished_at: 1_700_000_060,
              items_fetched: 1,
              items_new: 1,
              error: null,
            },
          ],
        }),
      },
    });

    const s = await q.loadSystemSources(db);
    expect(s.lastRunBySource).toBeUndefined();
  });
});
