/**
 * Local, credential-free smoke for #189.
 *
 * Stands up a real D1 (miniflare), applies every migration file in order,
 * seeds a pre-identity run, an attributed run, and a high-volume run whose
 * calls are older than a small newest run — the case the shared `LIMIT 2000`
 * used to starve. Then it drives the real route handler and the real
 * disclosure helpers end to end. Nothing here touches aidr.today or any
 * Cloudflare account.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Miniflare } from "miniflare";

const WEB = path.resolve(import.meta.dirname, "..");

const { Route } = await import(
  path.join(WEB, "src/routes/api/system.run-attempts.ts")
);
const {
  isPreIdentityRun,
  runModelsDisclosure,
  stepFallbackNotes,
  safeRunSteps,
} = await import(path.join(WEB, "src/components/system/run-format.ts"));
const { loadRunAttempts, loadSystemRuns } = await import(
  path.join(WEB, "src/lib/system-queries.ts")
);

const PRE = "288329e9-2c0b-4abc-9d76-f9fdcc633d84"; // shipped pre-#161
const ATTR = "08f43f12-61aa-4a45-a946-a5b415dc18d3"; // shipped post-#161
const BUSY = "55555555-5555-4555-8555-555555555555"; // high-volume, older
const STARVED = "44444444-4444-4444-8444-444444444444"; // newest, small

/**
 * Split a migration file the way `wrangler d1 migrations apply` does.
 * Asking SQLite which statements are complete is the source of truth: a
 * hand-rolled `split(";")` breaks on `CREATE TRIGGER … BEGIN … END;`
 * (migration 0023) and on quoted semicolons.
 */
function statements(sql: string): string[] {
  const noComments = sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
  const probe = new DatabaseSync(":memory:");
  const out: string[] = [];
  let current = "";
  for (const part of noComments.split(";")) {
    current = current ? `${current};\n${part}` : part;
    if (!current.trim()) continue;
    try {
      probe.exec(current);
      out.push(current.trim());
      current = "";
    } catch {
      // Not a complete statement yet — keep accumulating.
    }
  }
  probe.close();
  if (current.trim()) out.push(current.trim());
  return out;
}

const mf = new Miniflare({
  isolatedResourcePersistencePath: "issue-189-smoke",
  workers: [
    {
      config: {
        name: "issue-189-smoke",
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

const db = await mf.getD1Database("DB");

// Every migration, in filename order — the same order the ledger enforces.
const dir = path.join(WEB, "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
let applied = 0;
for (const f of files) {
  const stmts = statements(readFileSync(path.join(dir, f), "utf8"));
  for (let i = 0; i < stmts.length; i += 20) {
    const chunk = stmts.slice(i, i + 20);
    await db.batch(chunk.map((s) => db.prepare(s)));
    applied += chunk.length;
  }
}
console.log(
  `applied ${applied} statements from ${files.length} migration files`
);

const T0 = 1_790_349_075_000;
const CHAIN =
  "LLM thin (anyrouter chain exhausted: anyrouter/auto: anyrouter provider " +
  "error | deepseek/deepseek-v4.1-flash: anyrouter request failed: 502 | " +
  "poolside/laguna-s-2.1: anyrouter provider error | minimax/m3: anyrouter " +
  "request failed: 502); per-token thresholds too high";

const BUSY_CALLS = 2_050;
const STARVED_CALLS = 7;

// Runs in the order the list returns them (newest first).
const RUN_FIXTURES: [
  string,
  number,
  number,
  number,
  Record<string, unknown>,
][] = [
  [STARVED, 7_200, 150, 9, { tokens: 700 }],
  [BUSY, 5_400, 400, 40, { tokens: 205_000 }],
  [
    ATTR,
    3_600,
    160,
    12,
    { tokens: 30_276, steps: [{ name: "score", action: "scored 12 items" }] },
  ],
  [
    PRE,
    0,
    178,
    18,
    {
      tokens: 13_733,
      bySource: { hn: 20 },
      steps: [
        { name: "fetch", action: "178 items from 20 sources" },
        { name: "score", action: "scored 18 items" },
        { name: "tldr", action: "generated", reason: CHAIN },
      ],
    },
  ],
];
for (const [id, offsetSec, fetched, isNew, stats] of RUN_FIXTURES) {
  const started = Math.floor(T0 / 1000) + offsetSec;
  await db
    .prepare(
      `INSERT INTO workflow_runs (id, started_at, finished_at, items_fetched, items_new, error, stats)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`
    )
    .bind(id, started, started + 45, fetched, isNew, JSON.stringify(stats))
    .run();
}

const call = (
  ts: number,
  runId: string | null,
  model: string,
  ok: number,
  tokens: number,
  status: number | null
) =>
  db
    .prepare(
      `INSERT INTO llm_calls (ts, run_id, task, model, ok, tokens, duration_ms, error, prompt_chars,
         prompt_tokens, completion_tokens, cached_tokens, error_code, error_status)
       VALUES (?,?,'score',?,?,?,4200,?,900,800,200,50,?,?)`
    )
    .bind(
      ts,
      runId,
      model,
      ok,
      tokens,
      ok === 0 ? "anyrouter request failed: 502" : null,
      status ? "provider_error" : null,
      status
    )
    .run();

// Pre-identity run: calls exist and spent tokens, but run_id is NULL.
await call(T0, null, "anyrouter/auto", 0, 9_000, 502);
await call(T0 + 1, null, "deepseek/deepseek-v4.1-flash", 0, 0, 502);
// Attributed run: every call carries its run id.
await call(T0 + 10, ATTR, "typesafe/jev", 1, 1_000, null);
await call(T0 + 11, ATTR, "google/gemini-3.5-flash", 0, 0, 502);
await call(T0 + 12, ATTR, "minimax/m3", 1, 29_000, null);

// The shared-cap scenario. The busy run's calls are OLDER than the newest
// run's, so a single global `ORDER BY ts ASC LIMIT 2000` across all runs
// consumed the whole budget and the newest run got nothing — reported to
// the user as "No model data available." for the run they opened first.
const bulkInsert = db.prepare(
  `INSERT INTO llm_calls (ts, run_id, task, model, ok, tokens, duration_ms, prompt_chars)
   VALUES (?, ?, 'score', ?, 1, 100, 1000, 900)`
);
for (let i = 0; i < BUSY_CALLS; i += 100) {
  await db.batch(
    Array.from({ length: Math.min(100, BUSY_CALLS - i) }, (_, k) =>
      bulkInsert.bind(T0 + 30_000_000 + i + k, BUSY, "anyrouter/auto")
    )
  );
}
for (let i = 0; i < STARVED_CALLS; i += 100) {
  await db.batch(
    Array.from({ length: Math.min(100, STARVED_CALLS - i) }, (_, k) =>
      bulkInsert.bind(T0 + 90_000_000 + i + k, STARVED, "typesafe/jev")
    )
  );
}

const handler = (
  Route.options as unknown as {
    server: {
      handlers: {
        GET: (a: { request: Request; context: unknown }) => Promise<Response>;
      };
    };
  }
).server.handlers.GET;

const callApi = async (runId: string) => {
  const res = await handler({
    request: new Request(
      `https://aidr.today/api/system/run-attempts?run_id=${runId}`
    ),
    context: { env: { DB: db } },
  });
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
};

console.log("\n--- GET /api/system/run-attempts (post-#161 run) ---");
const attr = await callApi(ATTR);
console.log(
  "HTTP",
  attr.status,
  "attempts:",
  (attr.body.attempts as unknown[]).length,
  "truncated:",
  attr.body.truncated
);
console.log(
  "models:",
  [
    ...new Set((attr.body.attempts as { model: string }[]).map((a) => a.model)),
  ].join(", ")
);

console.log("\n--- GET /api/system/run-attempts (pre-identity run) ---");
const pre = await callApi(PRE);
console.log("HTTP", pre.status, JSON.stringify(pre.body));

console.log("\n--- disclosure state for each run ---");
const runs = await loadSystemRuns(db);
for (const r of runs) {
  const steps = safeRunSteps(r.stats);
  const label =
    r.id === PRE
      ? "pre-identity"
      : r.id === ATTR
        ? "attributed "
        : "busy/newest";
  console.log(`${label} run ${r.id.slice(0, 8)}`);
  console.log("  list llm.calls :", r.llm?.calls ?? "(none)");
  console.log("  list models    :", JSON.stringify(r.llm?.models ?? []));
  console.log("  truncated      :", r.llm?.truncated ?? "(not set)");
  console.log("  stats.tokens   :", r.stats?.tokens ?? "(none)");
  console.log(
    "  models panel   :",
    runModelsDisclosure(
      r.llm?.calls ? "ready" : "empty",
      r.llm?.models ?? [],
      r.stats,
      r.llm,
      []
    )
  );
  const notes = stepFallbackNotes(steps);
  console.log(
    "  step fallbacks :",
    notes.length === 0
      ? "(none)"
      : notes.map((n) => `${n.step}=${n.kind}`).join(" ")
  );
}

console.log("\n--- the shared-cap regression (#189 review) ---");
const busyRow = runs.find((r) => r.id === BUSY)!;
const starvedRow = runs.find((r) => r.id === STARVED)!;
const busyDetail = await loadRunAttempts(db, BUSY);
const starvedDetail = await loadRunAttempts(db, STARVED);
console.log(
  `busy    ${BUSY.slice(0, 8)}  list calls=${busyRow.llm?.calls} (seeded ${BUSY_CALLS})`
);
console.log(
  `starved ${STARVED.slice(0, 8)}  list calls=${starvedRow.llm?.calls} models=${JSON.stringify(starvedRow.llm?.models ?? [])} (seeded ${STARVED_CALLS})`
);
console.log(
  `per-run detail: busy attempts=${busyDetail.attempts.length} truncated=${busyDetail.truncated}; starved attempts=${starvedDetail.attempts.length} truncated=${starvedDetail.truncated}`
);

console.log("\n--- assertion ---");
const preRow = runs.find((r) => r.id === PRE)!;
const preIsPreIdentity = isPreIdentityRun(preRow.stats, preRow.llm, []);
const notes = stepFallbackNotes(safeRunSteps(preRow.stats));

const checks: [string, boolean][] = [
  // Original #189 disclosure.
  ["pre-identity run is recognised as such", preIsPreIdentity],
  ["pre-identity run has no llm summary", preRow.llm === undefined],
  [
    "pre-identity run still shows 13,733 tokens",
    preRow.stats?.tokens === 13_733,
  ],
  [
    "pre-identity run leaks no other run's calls",
    !JSON.stringify(preRow).includes("gemini"),
  ],
  ["provider chain recovered from step reason", notes.length >= 1],
  [
    "provider chain classified as exhausted",
    notes.some((n) => n.kind === "chain_exhausted"),
  ],
  [
    "provider chain keeps no raw provider body",
    !JSON.stringify(notes).includes("sk-") &&
      !JSON.stringify(notes).includes("https://"),
  ],
  [
    "run-attempts returns 400 for a bad id",
    (await callApi("../../etc/passwd")).status === 400,
  ],
  // Lookup-state gating.
  [
    "completed empty lookup -> pre_identity",
    runModelsDisclosure("empty", [], preRow.stats, preRow.llm, []) ===
      "pre_identity",
  ],
  [
    "failed lookup -> unavailable, not pre_identity",
    runModelsDisclosure("error", [], preRow.stats, preRow.llm, []) ===
      "unavailable",
  ],
  [
    "unsupported lookup -> unavailable",
    runModelsDisclosure("unavailable", [], preRow.stats, preRow.llm, []) ===
      "unavailable",
  ],
  [
    "in-flight lookup -> pending, not pre_identity",
    runModelsDisclosure("loading", [], preRow.stats, preRow.llm, []) ===
      "pending",
  ],
  // The shared cap.
  [
    "busy run counts all calls, not the 2,000 cap",
    busyRow.llm?.calls === BUSY_CALLS,
  ],
  [
    "busy run is not marked truncated (SQL aggregation)",
    busyRow.llm?.truncated === undefined,
  ],
  [
    "busy run token total is the full sum",
    busyRow.llm?.tokens === BUSY_CALLS * 100,
  ],
  [
    "starved (newest) run is NOT omitted",
    starvedRow.llm?.calls === STARVED_CALLS,
  ],
  [
    "starved run still resolves its models",
    JSON.stringify(starvedRow.llm?.models) === '["typesafe/jev"]',
  ],
  ["busy run detail is capped at 2,000", busyDetail.attempts.length === 2_000],
  ["busy run detail flags truncation", busyDetail.truncated === true],
  [
    "starved run detail is complete",
    starvedDetail.attempts.length === STARVED_CALLS,
  ],
  ["starved run detail is not truncated", starvedDetail.truncated === false],
  [
    "no run's detail leaks another run's calls",
    starvedDetail.attempts.every((a) => a.runId === STARVED),
  ],
  [
    "attributed run detail is complete and unattributed",
    (await loadRunAttempts(db, ATTR)).attempts.length === 3,
  ],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
await mf.dispose();
console.log(failed === 0 ? "\nSMOKE OK" : `\nSMOKE FAILED (${failed})`);
process.exit(failed === 0 ? 0 : 1);
