/**
 * #189 review — the shared 2,000-row cap.
 *
 * `loadLlmCallsForRuns` used to issue ONE `ORDER BY ts ASC LIMIT 2000`
 * across every listed run. Because that cap is global and oldest-first, a
 * high-volume run consumed the whole budget and the *newest* runs got
 * nothing — so the runs list silently reported "no model data" for the runs
 * a user most wants to inspect.
 *
 * The list path now aggregates in SQL (`GROUP BY run_id`), which is bounded
 * by run count rather than call count and cannot starve anyone. This file
 * proves that on a real D1 database seeded with far more than 2,000 calls.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadRunAttempts, loadSystemRuns } from "./system-queries";

/** 0001 creates `workflow_runs`; 0012 adds the `stats` column this test
 * writes. The llm_calls chain starts at 0013. */
const MIGRATIONS = [
  "0001_init.sql",
  "0012_workflow_run_stats.sql",
  "0013_llm_calls.sql",
  "0016_llm_calls_usage.sql",
  "0025_llm_call_run_identity.sql",
];

/** Split a migration file, asking SQLite which statements are complete. */
function statements(sql: string): string[] {
  const noComments = sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
  const out: string[] = [];
  let current = "";
  for (const part of noComments.split(";")) {
    current = current ? `${current};\n${part}` : part;
    if (!current.trim()) continue;
    // A trailing comment-only or partial fragment is not executable.
    if (!/\S/.test(current.replace(/--.*$/gm, ""))) {
      current = "";
      continue;
    }
    out.push(current.trim());
    current = "";
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;

/** Oldest run: a huge burst of calls, as during a fallback storm. */
const BUSY_RUN = "11111111-1111-4111-8111-111111111111";
/** Newest runs: small, and the ones an operator expands first. */
const MID_RUN = "22222222-2222-4222-8222-222222222222";
const NEWEST_RUN = "33333333-3333-4333-8333-333333333333";

const BUSY_CALLS = 2_050;
const MID_CALLS = 12;
const NEWEST_CALLS = 7;
const TOTAL_CALLS = BUSY_CALLS + MID_CALLS + NEWEST_CALLS;

const T0 = 1_790_000_000_000;

beforeAll(async () => {
  mf = new Miniflare({
    isolatedResourcePersistencePath: "run-llm-cap-d1",
    workers: [
      {
        config: {
          name: "run-llm-cap-d1",
          type: "worker",
          compatibilityDate: "2026-09-25",
          manifest: {
            mainModule: "main.mjs",
            modules: {
              "main.mjs": {
                type: "esm",
                contents: "export default { fetch: () => new Response('ok') };",
              },
            },
          },
          env: { DB: { type: "d1" } },
        },
      },
    ],
  });
  db = await mf.getD1Database("DB");

  const dir = path.resolve(import.meta.dirname, "../../migrations");
  for (const name of MIGRATIONS) {
    for (const stmt of statements(readFileSync(path.join(dir, name), "utf8"))) {
      await db.prepare(stmt).run();
    }
  }

  const runs: [string, number, number][] = [
    // Newest first, matching the runs list ORDER BY.
    [NEWEST_RUN, 3_600, NEWEST_CALLS],
    [MID_RUN, 1_800, MID_CALLS],
    [BUSY_RUN, 0, BUSY_CALLS],
  ];
  for (const [id, offsetSec, calls] of runs) {
    const started = Math.floor(T0 / 1000) + offsetSec;
    await db
      .prepare(
        `INSERT INTO workflow_runs (id, started_at, finished_at, items_fetched, items_new, error, stats)
         VALUES (?, ?, ?, 100, 5, NULL, ?)`
      )
      .bind(id, started, started + 60, JSON.stringify({ tokens: calls * 100 }))
      .run();
  }

  // The busy run gets the OLDEST timestamps, so a global oldest-first cap
  // would consume its entire budget before reaching the newer runs — the
  // exact starvation this test guards against.
  const insert = db.prepare(
    `INSERT INTO llm_calls (ts, run_id, task, model, ok, tokens, duration_ms,
       prompt_chars, prompt_tokens, completion_tokens, cached_tokens)
     VALUES (?, ?, 'score', ?, ?, 100, 1000, 900, 80, 20, 0)`
  );
  const rows: unknown[][] = [];
  for (let i = 0; i < BUSY_CALLS; i++) {
    rows.push([
      T0 + i * 10,
      BUSY_RUN,
      i % 2 === 0 ? "anyrouter/auto" : "minimax/m3",
      1,
    ]);
  }
  for (let i = 0; i < MID_CALLS; i++) {
    rows.push([T0 + 10_000_000 + i, MID_RUN, "google/gemini-3.5-flash", 1]);
  }
  for (let i = 0; i < NEWEST_CALLS; i++) {
    rows.push([T0 + 20_000_000 + i, NEWEST_RUN, "typesafe/jev", 1]);
  }
  for (let i = 0; i < rows.length; i += 100) {
    await db.batch(rows.slice(i, i + 100).map((r) => insert.bind(...r)));
  }
}, 180_000);

afterAll(async () => {
  await mf?.dispose();
});

describe("runs list is not starved by a high-volume run (#189 review)", () => {
  it("seeds more calls than the per-run read cap", async () => {
    const { results } = await db
      .prepare("SELECT COUNT(*) AS c FROM llm_calls")
      .all<{ c: number }>();
    expect(results[0].c).toBe(TOTAL_CALLS);
    expect(TOTAL_CALLS).toBeGreaterThan(2_000);
  });

  it("counts every call for every run, including the newest", async () => {
    const runs = await loadSystemRuns(db);
    const byId = new Map(runs.map((r) => [r.id, r]));

    // The busy run's true count, not the 2,000 cap.
    expect(byId.get(BUSY_RUN)?.llm?.calls).toBe(BUSY_CALLS);
    // The runs an operator expands first are not silently omitted.
    expect(byId.get(MID_RUN)?.llm?.calls).toBe(MID_CALLS);
    expect(byId.get(NEWEST_RUN)?.llm?.calls).toBe(NEWEST_CALLS);

    // Nothing was dropped, so nothing needs to be flagged as truncated.
    for (const id of [BUSY_RUN, MID_RUN, NEWEST_RUN]) {
      expect(byId.get(id)?.llm?.truncated).toBeUndefined();
    }
  });

  it("still resolves models for the newest run", async () => {
    const runs = await loadSystemRuns(db);
    const newest = runs.find((r) => r.id === NEWEST_RUN);
    // Under the old global cap this run returned no `llm` at all, which the
    // UI then rendered as "No model data available."
    expect(newest?.llm?.models).toEqual(["typesafe/jev"]);
  });

  it("keeps model inventories distinct per run and in first-seen order", async () => {
    const runs = await loadSystemRuns(db);
    const byId = new Map(runs.map((r) => [r.id, r]));
    expect(byId.get(BUSY_RUN)?.llm?.models).toEqual([
      "anyrouter/auto",
      "minimax/m3",
    ]);
    expect(byId.get(MID_RUN)?.llm?.models).toEqual(["google/gemini-3.5-flash"]);
  });

  it("sums tokens across the whole run, not just the read window", async () => {
    const runs = await loadSystemRuns(db);
    const busiest = runs.find((r) => r.id === BUSY_RUN);
    expect(busiest?.llm?.tokens).toBe(BUSY_CALLS * 100);
  });

  it("caps only the per-run detail endpoint, and says so", async () => {
    // The row cap still exists for the expanded run's per-call table.
    const busy = await loadRunAttempts(db, BUSY_RUN);
    expect(busy.status).toBe("ready");
    expect(busy.attempts).toHaveLength(2_000);
    expect(busy.truncated).toBe(true);

    // A run under the cap is unaffected.
    const newest = await loadRunAttempts(db, NEWEST_RUN);
    expect(newest.attempts).toHaveLength(NEWEST_CALLS);
    expect(newest.truncated).toBe(false);
  });

  it("does not let the busy run's rows leak into another run's detail", async () => {
    const newest = await loadRunAttempts(db, NEWEST_RUN);
    expect(newest.attempts.every((a) => a.runId === NEWEST_RUN)).toBe(true);
    expect(newest.attempts.map((a) => a.model)).toEqual(
      Array.from({ length: NEWEST_CALLS }, () => "typesafe/jev")
    );
  });
});
