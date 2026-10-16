/**
 * #189 — the write path, over a real D1 database.
 *
 * The read-side tests cover attribution; these cover the other half of the
 * contract: that the D1 sink persists `run_id` and the rest of the call
 * identity into the schema the numbered migrations build.
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
  resetLlmCallLogState,
} from "../llm-call-log.js";
import { providerErrorSnippet } from "../telemetry-safe.js";
import type { Env } from "../types.js";
import { BEARER } from "./fake-secrets.js";

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

const T0 = 1_790_349_075_000;

const RUN_A = "aaaaaaaa-1111-4111-8111-aaaaaaaa1111";
const RUN_B = "bbbbbbbb-2222-4222-8222-bbbbbbbb2222";

// Vitest runs test files in parallel threads inside one process. Without an
// isolated persistence path both D1 fixtures would share the same on-disk
// database and rebuild each other's schema mid-run.
const ISOLATION = { isolatedResourcePersistencePath: "llm-call-log-identity" };

const LLM_CALLS_MIGRATIONS = [
  "0013_llm_calls.sql",
  "0016_llm_calls_usage.sql",
  "0025_llm_call_run_identity.sql",
  "0033_llm_call_route.sql",
  "0034_llm_call_id.sql",
  "0035_llm_call_cost_request.sql",
];

function llmCallsSchema(): string[] {
  const dir = path.resolve(import.meta.dirname, "../../migrations");
  return LLM_CALLS_MIGRATIONS.flatMap((name) =>
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
 * result rather than sleeping a fixed amount. */
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
  for (const stmt of llmCallsSchema()) await db.prepare(stmt).run();
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
});

afterEach(async () => {
  // `logLlmCall` is fire-and-forget, so an insert from the test that just
  // finished can still be in flight. Let it land *before* the next test
  // rebuilds the table, otherwise it pollutes the next test's rows.
  setLlmCallLogger(null);
  resetLlmCallLogState();
  await new Promise((r) => setTimeout(r, 150));
});

beforeEach(async () => {
  await db.prepare("DROP TABLE IF EXISTS llm_calls").run();
  for (const stmt of llmCallsSchema()) await db.prepare(stmt).run();
});

describe("llm_calls run identity over a real D1 (#189)", () => {
  it("persists run_id and the full call identity in one row", async () => {
    setLlmCallLogger(createD1LlmCallLogger(env(), RUN_A));
    logLlmCall(
      entry({
        route: ["@preset/aidr", "anyrouter/auto"],
        provider: "provider-a",
        callId: "call-1",
        costUsd: 0.0123,
        requestId: "request-1",
      })
    );

    await waitFor(
      () => rows(RUN_A),
      (r) => r.length > 0
    );
    const res = await db
      .prepare(
        "SELECT route, provider, call_id, cost_usd, request_id, prompt_tokens, cached_tokens FROM llm_calls WHERE run_id = ?"
      )
      .bind(RUN_A)
      .all<Record<string, unknown>>();
    expect(res.results).toEqual([
      {
        route: JSON.stringify(["@preset/aidr", "anyrouter/auto"]),
        provider: "provider-a",
        call_id: "call-1",
        cost_usd: 0.0123,
        request_id: "request-1",
        prompt_tokens: 800,
        cached_tokens: 50,
      },
    ]);
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

  it("persists a sanitized snippet on failed rows only", async () => {
    setLlmCallLogger(createD1LlmCallLogger(env(), RUN_A));
    logLlmCall(
      entry({
        ok: false,
        tokens: 0,
        error:
          "anyrouter request failed: 502 Bearer sk-live-secret https://provider.test/raw",
        responseSnippet: providerErrorSnippet(
          502,
          `<html><body>Bad Gateway for reader@example.com ${BEARER} sk-live-secret</body></html>`
        ),
      })
    );
    logLlmCall(entry({ ok: true, responseSnippet: "served answer" }));
    await waitFor(
      () => rows(RUN_A),
      (r) => r.length > 1
    );

    const res = await db
      .prepare(
        "SELECT error, error_code, error_status, response_snippet FROM llm_calls WHERE run_id = ?"
      )
      .bind(RUN_A)
      .all<Record<string, unknown>>();
    const row = res.results.find((r) => r.error_code != null)!;
    expect(row).toBeDefined();
    expect(row.error_code).toBe("provider_error");
    expect(row.error_status).toBe(502);
    // Secrets and the raw provider body never reach the column.
    expect(String(row.error)).not.toContain("sk-live-secret");
    expect(String(row.error)).not.toContain("provider.test");
    expect(JSON.parse(String(row.response_snippet))).toEqual({
      kind: "provider_error",
      status: 502,
      body: "non-json error body (82 bytes)",
    });
    const served = res.results.find((r) => r.error_code == null)!;
    expect(served.response_snippet).toBeNull();
  });
});
