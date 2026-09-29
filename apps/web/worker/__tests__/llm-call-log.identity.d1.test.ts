/**
 * #189 — the write path, over a real D1 database.
 *
 * The read-side tests cover attribution; these cover the other half of the
 * contract: that the D1 sink persists `run_id`, that an un-migrated DB still
 * gains the identity columns at runtime, and that the runtime column guard
 * neither retries a terminal schema error forever nor latches a transient
 * one (which would permanently disable run identity).
 *
 * Every test starts from the pre-0025 schema (migrations 0013 + 0016) so the
 * runtime guard is exercised exactly as on a DB whose migration has not been
 * applied yet.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Miniflare } from "miniflare";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  type LlmCallLogEntry,
  logLlmCall,
  setLlmCallLogger,
  withLlmCallContext,
} from "../llm.js";
import {
  createD1LlmCallLogger,
  resetLlmCallLogSchemaCache,
} from "../llm-call-log.js";
import type { Env } from "../types.js";

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

/** Must match TELEMETRY_COLUMNS_SQL in ../llm-call-log.js. */
const TELEMETRY_COLUMN_COUNT = 6;
const T0 = 1_790_349_075_000;

const RUN_A = "aaaaaaaa-1111-4111-8111-aaaaaaaa1111";
const RUN_B = "bbbbbbbb-2222-4222-8222-bbbbbbbb2222";

// Vitest runs test files in parallel threads inside one process. Without an
// isolated persistence path both D1 fixtures would share the same on-disk
// database and rebuild each other's schema mid-run.
const ISOLATION = { isolatedResourcePersistencePath: "llm-call-log-identity" };

/** 0013 + 0016 only: no run_id / error_code / error_status. */
function pre0025Schema(): string[] {
  const dir = path.resolve(import.meta.dirname, "../../migrations");
  return ["0013_llm_calls.sql", "0016_llm_calls_usage.sql"].flatMap((name) =>
    statements(readFileSync(path.join(dir, name), "utf8"))
  );
}

function entry(overrides: Partial<LlmCallLogEntry> = {}): LlmCallLogEntry {
  return {
    ts: T0,
    task: "score",
    model: "anyrouter/auto",
    ok: true,
    tokens: 1_000,
    promptTokens: 800,
    completionTokens: 200,
    cachedTokens: 50,
    durationMs: 4_200,
    error: null,
    promptChars: 900,
    responseSnippet: "raw provider body",
    ...overrides,
  };
}

/** `logLlmCall` is fire-and-forget by design, so poll for the expected
 * result rather than sleeping a fixed amount. Reads can legitimately fail
 * while the runtime column guard is still mid-flight (e.g. `run_id` does
 * not exist yet), so a throwing read counts as "not ready yet". */
async function waitFor<T>(
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  timeoutMs = 5_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let value: T | undefined;
    try {
      value = await read();
    } catch {
      value = undefined;
    }
    if (value !== undefined && ok(value)) return value;
    if (Date.now() >= deadline) {
      if (value === undefined) {
        // Surface the last read failure rather than a bare undefined.
        return read();
      }
      return value;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function rows(runId?: string) {
  const sql = runId
    ? "SELECT run_id, model, tokens FROM llm_calls WHERE run_id = ? ORDER BY id"
    : "SELECT run_id, model, tokens FROM llm_calls ORDER BY id";
  const stmt = db.prepare(sql);
  const res = await (runId ? stmt.bind(runId) : stmt).all<{
    run_id: string | null;
    model: string;
    tokens: number;
  }>();
  return res.results;
}

async function columnNames(): Promise<string[]> {
  const res = await db
    .prepare("SELECT name FROM pragma_table_info('llm_calls')")
    .all<{ name: string }>();
  return res.results.map((c) => c.name);
}

beforeAll(async () => {
  mf = new Miniflare({
    ...ISOLATION,
    workers: [
      {
        config: {
          name: "llm-call-log-identity-d1",
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
  for (const stmt of pre0025Schema()) await db.prepare(stmt).run();
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
});

afterEach(async () => {
  // `logLlmCall` is fire-and-forget, so an insert from the test that just
  // finished can still be in flight. Let it land *before* the next test
  // rebuilds the table, otherwise it pollutes the next test's rows.
  setLlmCallLogger(null);
  resetLlmCallLogSchemaCache();
  await new Promise((r) => setTimeout(r, 150));
});

beforeEach(async () => {
  // Rebuild the un-migrated schema so each test starts from the same place
  // and the runtime column guard has real work to do.
  await db.prepare("DROP TABLE IF EXISTS llm_calls").run();
  for (const stmt of pre0025Schema()) await db.prepare(stmt).run();
});

describe("llm_calls run identity over a real D1 (#189)", () => {
  it("adds the identity columns at runtime and persists run_id", async () => {
    expect(await columnNames()).not.toContain("run_id");

    setLlmCallLogger(createD1LlmCallLogger(env(), RUN_A));
    logLlmCall(entry());

    // The guard added the columns even though 0025 was never applied.
    const names = await waitFor(
      columnNames,
      (n) => n.includes("run_id") && n.includes("error_status")
    );
    expect(names).toContain("run_id");
    expect(names).toContain("error_code");
    expect(names).toContain("error_status");

    // Identity landed, so the read side can attribute this call to the run.
    expect(
      await waitFor(
        () => rows(RUN_A),
        (r) => r.length > 0
      )
    ).toEqual([{ run_id: RUN_A, model: "anyrouter/auto", tokens: 1_000 }]);
  });

  it("retries a transient column-add failure instead of latching it", async () => {
    // The schema cache must not be marked ready when an ALTER failed, or
    // run_id is never added again and every later call falls back to the
    // legacy INSERT that carries no identity.
    const realPrepare = db.prepare.bind(db);
    let failedOnce = false;
    const patched = {
      prepare: (sql: string) => {
        if (!failedOnce && sql.includes("ADD COLUMN run_id")) {
          failedOnce = true;
          return {
            bind: () => patched,
            run: async () => {
              throw new Error("D1_ERROR: database is locked. Try again later.");
            },
          };
        }
        return realPrepare(sql);
      },
    } as unknown as D1Database;

    setLlmCallLogger(
      createD1LlmCallLogger({ DB: patched } as unknown as Env, RUN_B)
    );
    logLlmCall(entry({ model: "typesafe/jev" }));
    // The first pass could not add run_id, so the call went down the legacy
    // INSERT, which carries no identity.
    const legacy = await waitFor(
      async () =>
        (
          await db
            .prepare("SELECT model FROM llm_calls")
            .all<{ model: string }>()
        ).results.map((r) => r.model),
      (models) => models.includes("typesafe/jev")
    );
    expect(legacy).toEqual(["typesafe/jev"]);
    expect(await columnNames()).not.toContain("run_id");

    // The cache was not latched, so the next call retries the ALTER and
    // identity starts working again.
    setLlmCallLogger(createD1LlmCallLogger(env(), RUN_B));
    logLlmCall(entry({ model: "minimax/m3", ts: T0 + 1 }));
    expect(
      await waitFor(
        () => rows(RUN_B),
        (r) => r.length > 0
      )
    ).toEqual([{ run_id: RUN_B, model: "minimax/m3", tokens: 1_000 }]);
  });

  it("stops retrying a settled schema error instead of looping forever", async () => {
    // A missing table is terminal for this isolate: re-issuing six ALTERs on
    // every logged call would add a failed DDL round-trip per attempt for a
    // schema that will never appear. The insert ladder still runs.
    const realPrepare = db.prepare.bind(db);
    let alterAttempts = 0;
    const patched = {
      prepare: (sql: string) => {
        if (!sql.includes("ADD COLUMN")) return realPrepare(sql);
        alterAttempts++;
        return {
          bind: () => patched,
          run: async () => {
            throw new Error("D1_ERROR: no such table: llm_calls");
          },
        };
      },
    } as unknown as D1Database;

    setLlmCallLogger(
      createD1LlmCallLogger({ DB: patched } as unknown as Env, RUN_B)
    );
    // Log three calls in sequence, letting each fire-and-forget insert
    // finish. The ALTER list must be walked once, not once per call.
    const attemptsPerCall: number[] = [];
    for (let i = 0; i < 3; i++) {
      const before = alterAttempts;
      logLlmCall(entry({ ts: T0 + i }));
      await new Promise((r) => setTimeout(r, 200));
      attemptsPerCall.push(alterAttempts - before);
    }

    // First call pays for the one DDL pass; the rest skip it entirely.
    expect(attemptsPerCall[0]).toBe(TELEMETRY_COLUMN_COUNT);
    expect(attemptsPerCall.slice(1)).toEqual([0, 0]);
    setLlmCallLogger(null);
  });

  it("keeps identity per operation under AsyncLocalStorage", async () => {
    setLlmCallLogger(createD1LlmCallLogger(env(), null));
    await withLlmCallContext(RUN_A, async () => {
      logLlmCall(entry({ model: "typesafe/jev" }));
    });
    await withLlmCallContext(RUN_B, async () => {
      logLlmCall(entry({ model: "minimax/m3" }));
    });

    // Each operation's calls carry only its own identity — never a mix.
    expect(
      await waitFor(
        () => rows(RUN_A),
        (r) => r.length > 0
      )
    ).toEqual([{ run_id: RUN_A, model: "typesafe/jev", tokens: 1_000 }]);
    expect(
      await waitFor(
        () => rows(RUN_B),
        (r) => r.length > 0
      )
    ).toEqual([{ run_id: RUN_B, model: "minimax/m3", tokens: 1_000 }]);
  });

  it("prefers the explicit entry identity over the logger fallback", async () => {
    setLlmCallLogger(createD1LlmCallLogger(env(), RUN_A));
    logLlmCall(entry({ runId: RUN_B, model: "poolside/laguna-s-2.1" }));
    expect(
      await waitFor(
        () => rows(RUN_B),
        (r) => r.length > 0
      )
    ).toEqual([
      { run_id: RUN_B, model: "poolside/laguna-s-2.1", tokens: 1_000 },
    ]);
    expect(await rows(RUN_A)).toEqual([]);
  });

  it("logs NULL run_id when there is genuinely no identity", async () => {
    setLlmCallLogger(createD1LlmCallLogger(env(), null));
    logLlmCall(entry());
    // The row is still recorded — observability must not depend on identity
    // — it is simply unattributable, which is what the read side reports.
    expect(
      await waitFor(
        () => rows(),
        (r) => r.length > 0
      )
    ).toEqual([{ run_id: null, model: "anyrouter/auto", tokens: 1_000 }]);
  });

  it("persists structured error fields without the provider payload", async () => {
    setLlmCallLogger(createD1LlmCallLogger(env(), RUN_A));
    logLlmCall(
      entry({
        ok: false,
        tokens: 0,
        error:
          "anyrouter request failed: 502 Bearer sk-live-secret https://provider.test/raw",
      })
    );
    await waitFor(
      () => rows(RUN_A),
      (r) => r.length > 0
    );

    const res = await db
      .prepare(
        "SELECT error, error_code, error_status, response_snippet FROM llm_calls WHERE run_id = ?"
      )
      .bind(RUN_A)
      .all<Record<string, unknown>>();
    const row = res.results[0];
    expect(row).toBeDefined();
    expect(row.error_code).toBe("provider_error");
    expect(row.error_status).toBe(502);
    // Secrets and the raw provider body never reach the column.
    expect(String(row.error)).not.toContain("sk-live-secret");
    expect(String(row.error)).not.toContain("provider.test");
    expect(row.response_snippet).toBeNull();
  });

  it("keeps identity when a write hits a schema without usage columns", async () => {
    // Simulate a pre-0016 DB: only run identity columns exist. The insert
    // ladder must fall back to a reduced INSERT that still carries run_id,
    // not the legacy shape that drops it.
    await db
      .prepare(
        "CREATE TABLE llm_calls_old AS SELECT id, ts, task, model, ok, tokens, duration_ms, error, prompt_chars, response_snippet FROM llm_calls WHERE 0"
      )
      .run();
    await db.prepare("DROP TABLE llm_calls").run();
    await db.prepare("ALTER TABLE llm_calls_old RENAME TO llm_calls").run();
    for (const col of ["run_id", "error_code", "error_status"]) {
      await db
        .prepare(
          `ALTER TABLE llm_calls ADD COLUMN ${col} ${col === "error_status" ? "INTEGER" : "TEXT"}`
        )
        .run();
    }
    resetLlmCallLogSchemaCache();

    setLlmCallLogger(createD1LlmCallLogger(env(), RUN_A));
    logLlmCall(entry());

    // prompt_tokens / completion_tokens / cached_tokens are absent, so the
    // reduced insert runs — but identity survives.
    expect(
      await waitFor(
        () => rows(RUN_A),
        (r) => r.length > 0
      )
    ).toEqual([{ run_id: RUN_A, model: "anyrouter/auto", tokens: 1_000 }]);
  });
});
