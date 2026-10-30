/**
 * The llm-failure-rate alert measures final outcomes per chain call, over a
 * real D1 database: a flaky chain head that a later fallback covers is not an
 * outage, an exhausted chain is.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluateHealth, type HealthInput, readLlmCounts } from "../health.js";
import type { Env } from "../types.js";

const MIGRATIONS = [
  "0013_llm_calls.sql",
  "0016_llm_calls_usage.sql",
  "0025_llm_call_run_identity.sql",
  "0033_llm_call_route.sql",
  "0034_llm_call_id.sql",
  "0035_llm_call_cost_request.sql",
];

function statements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
const env = () => ({ DB: db }) as unknown as Env;

beforeAll(async () => {
  mf = new Miniflare({
    isolatedResourcePersistencePath: "health-llm-failure-rate",
    workers: [
      {
        config: {
          name: "health-llm-failure-rate-d1",
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
  for (const name of MIGRATIONS)
    for (const sql of statements(readFileSync(path.join(dir, name), "utf8")))
      await db.prepare(sql).run();
}, 120_000);
afterAll(() => mf?.dispose());

/** One chain call: attempts in order, each `true` when it produced output. */
async function chain(
  runId: string,
  callId: string | null,
  attempts: boolean[]
) {
  for (const [i, ok] of attempts.entries()) {
    await db
      .prepare(
        `INSERT INTO llm_calls (ts, task, model, ok, run_id, call_id, error_status)
         VALUES (?, 'score', ?, ?, ?, ?, ?)`
      )
      .bind(1_000 + i, `model-${i}`, ok ? 1 : 0, runId, callId, ok ? null : 500)
      .run();
  }
}

function alerts(llm: HealthInput["llm"]): string[] {
  return evaluateHealth({
    nowMs: 0,
    localHour: 3,
    steps: [],
    telegramLastPostMs: {},
    llm,
    history: [],
  }).map((i) => i.key);
}

describe("llm-failure-rate counts chain calls, not attempts", () => {
  it("does not alert when the head fails but a fallback serves every call", async () => {
    for (let i = 0; i < 6; i++)
      await chain("run-flaky", `c${i}`, [false, false, true]);
    const llm = await readLlmCounts(env(), "run-flaky");
    // 12 of 18 attempts failed (the old rule paged), but 0 of 6 calls did.
    expect(llm).toMatchObject({ total: 6, failed: 0 });
    expect(alerts(llm)).not.toContain("llm-failure-rate");
  });

  it("alerts when more than half the chains exhaust", async () => {
    for (let i = 0; i < 4; i++)
      await chain("run-down", `d${i}`, [false, false, false]);
    await chain("run-down", "d-ok", [false, true]);
    const llm = await readLlmCounts(env(), "run-down");
    expect(llm).toMatchObject({ total: 5, failed: 4 });
    expect(alerts(llm)).toContain("llm-failure-rate");
  });

  it("counts a row without call_id as its own call", async () => {
    await chain("run-legacy", null, [false, false, false, false]);
    const llm = await readLlmCounts(env(), "run-legacy");
    expect(llm).toMatchObject({ total: 4, failed: 4 });
  });
});
