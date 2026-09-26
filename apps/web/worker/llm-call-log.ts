import {
  type LlmCallLogEntry,
  redactLlmCallEntry,
  setLlmCallLogger,
  withLlmCallContext,
} from "./llm.js";
import { sanitizeError } from "./telemetry-safe.js";
import type { Env } from "./types.js";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Additive usage/identity columns from migrations 0016 and 0025. Applied at
 * runtime so local/preview DBs keep logging before migrations are applied. */
const TELEMETRY_COLUMNS_SQL = [
  "ALTER TABLE llm_calls ADD COLUMN prompt_tokens INTEGER",
  "ALTER TABLE llm_calls ADD COLUMN completion_tokens INTEGER",
  "ALTER TABLE llm_calls ADD COLUMN cached_tokens INTEGER",
  "ALTER TABLE llm_calls ADD COLUMN run_id TEXT",
  "ALTER TABLE llm_calls ADD COLUMN error_code TEXT",
  "ALTER TABLE llm_calls ADD COLUMN error_status INTEGER",
];

let telemetryColumnsReady = false;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A column that already exists is the success case, not a failure: D1
 * reports `duplicate column name` for the second attempt. */
function isAlreadyPresent(error: unknown): boolean {
  return /duplicate column name|already exists/i.test(errorMessage(error));
}

/**
 * Errors that will not fix themselves. Re-issuing the ALTER list on every
 * logged call for a schema that is never going to change would add a failed
 * DDL round-trip per attempt for the life of the isolate. Deliberately
 * excludes transient problems (lock contention, a busy database), which must
 * keep retrying.
 */
function isSettled(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    /no such table/i.test(message) ||
    /not authorized|permission denied|read-only/i.test(message) ||
    /syntax error/i.test(message) ||
    /\bunsupported\b|\bsorry\b/i.test(message)
  );
}

async function ensureTelemetryColumns(db: D1Database): Promise<void> {
  if (telemetryColumnsReady) return;
  let complete = true;
  let settled = false;
  for (const sql of TELEMETRY_COLUMNS_SQL) {
    try {
      await db.prepare(sql).run();
    } catch (error) {
      if (isAlreadyPresent(error)) continue;
      // A transient failure must not latch the cache: if it did, `run_id`
      // would never be added and every later call would fall through to the
      // legacy INSERT that carries no identity. Retry instead.
      if (isSettled(error)) {
        settled = true;
        continue;
      }
      complete = false;
    }
  }
  // `settled` means this isolate can never add the columns, so stop
  // re-issuing the DDL; the insert ladder still logs what the schema allows.
  telemetryColumnsReady = complete || settled;
}

/** Every D1 insert started by a logger, so a step can await them before its
 * callback returns. `logLlmCall` is fire-and-forget: without an explicit
 * drain, a Workflow step can resolve (and its isolate be reused/discarded)
 * while the insert is still in flight, and the row never lands. */
const pendingLlmCallWrites = new Set<Promise<void>>();

function trackLlmCallWrite(write: Promise<void>): void {
  pendingLlmCallWrites.add(write);
  const settle = () => pendingLlmCallWrites.delete(write);
  write.then(settle, settle);
}

/** Awaits in-flight `llm_calls` inserts (including ones started while
 * draining) so a step's telemetry is durable before the step returns.
 * Best-effort: inserts already swallow their own failures, and this never
 * throws, so a logger problem can never fail a pipeline step. */
export async function flushLlmCallWrites(): Promise<void> {
  // Bounded: a pass can only start writes from code that is still running,
  // and the loop stops as soon as a pass finds nothing in flight.
  for (let pass = 0; pass < 5 && pendingLlmCallWrites.size > 0; pass++) {
    await Promise.allSettled([...pendingLlmCallWrites]);
  }
}

/** Test helper — Worker isolate is long-lived; tests share the module. */
export function resetLlmCallLogSchemaCache(): void {
  telemetryColumnsReady = false;
  pendingLlmCallWrites.clear();
}

/**
 * Re-installs the D1-backed `llm_calls` sink *and* the run-id context for one
 * unit of LLM work, then returns whatever the callback produced.
 *
 * The ingest Workflow runs each `step.do` callback in an engine-managed
 * context: a step can be replayed in an isolate where the sink installed at
 * the top of `run()` is gone and where the async-local run id no longer
 * applies. Installing inside the callback (and not only around the outer
 * `run()`) is what keeps `logLlmCall` from silently no-opping, which is what
 * left `/data?tab=runs` with empty Models used and no attempt rows.
 *
 * Fire-and-forget is preserved: the callback is never made to await logging
 * per call, and `flushLlmCallWrites` (run by the step wrapper afterwards)
 * swallows failures.
 */
export function withRunLlmCallLogger<T>(
  env: Env,
  runId: string,
  callback: () => T
): T {
  setLlmCallLogger(createD1LlmCallLogger(env, runId));
  return withLlmCallContext(runId, callback);
}

/**
 * Builds a `setLlmCallLogger`-compatible sink that persists each entry to
 * D1's `llm_calls` table. Best-effort: an insert failure is logged and
 * swallowed, never rethrown — the anyrouter fallback loop that calls this
 * must never fail or slow down because observability logging broke.
 */
export function createD1LlmCallLogger(
  env: Env,
  fallbackRunId?: string | null
): (entry: LlmCallLogEntry) => Promise<void> {
  return (entry) => {
    const write = (async () => {
      const safeEntry = redactLlmCallEntry(entry);
      const safeError = sanitizeError(safeEntry.error);
      const runId = entry.runId ?? fallbackRunId ?? null;
      try {
        await ensureTelemetryColumns(env.DB);
        try {
          await env.DB.prepare(
            `INSERT INTO llm_calls (
               ts, task, model, ok, tokens, duration_ms, error,
               prompt_chars, response_snippet,
               prompt_tokens, completion_tokens, cached_tokens,
               run_id, error_code, error_status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              safeEntry.ts,
              safeEntry.task,
              safeEntry.model,
              safeEntry.ok ? 1 : 0,
              safeEntry.tokens,
              safeEntry.durationMs,
              safeError?.message ?? null,
              safeEntry.promptChars,
              null,
              safeEntry.promptTokens,
              safeEntry.completionTokens,
              safeEntry.cachedTokens,
              runId,
              safeError?.code ?? null,
              safeError?.status ?? null
            )
            .run();
          return;
        } catch {
          // A pre-0016/0025 DB may not have every optional column. The next
          // insert keeps identity if the identity migration exists, then the
          // legacy insert keeps logging safe aggregate fields only.
        }
        try {
          await env.DB.prepare(
            `INSERT INTO llm_calls (
               ts, task, model, ok, tokens, duration_ms, error,
               prompt_chars, response_snippet, run_id, error_code, error_status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              safeEntry.ts,
              safeEntry.task,
              safeEntry.model,
              safeEntry.ok ? 1 : 0,
              safeEntry.tokens,
              safeEntry.durationMs,
              safeError?.message ?? null,
              safeEntry.promptChars,
              null,
              runId,
              safeError?.code ?? null,
              safeError?.status ?? null
            )
            .run();
          return;
        } catch {
          // Fall through to the pre-identity schema.
        }
        await env.DB.prepare(
          `INSERT INTO llm_calls (ts, task, model, ok, tokens, duration_ms, error, prompt_chars, response_snippet)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            safeEntry.ts,
            safeEntry.task,
            safeEntry.model,
            safeEntry.ok ? 1 : 0,
            safeEntry.tokens,
            safeEntry.durationMs,
            safeError?.message ?? null,
            safeEntry.promptChars,
            null
          )
          .run();
      } catch (error) {
        console.error("llm_calls insert failed:", error);
      }
    })();
    trackLlmCallWrite(write);
    return write;
  };
}

/**
 * Best-effort retention: deletes `llm_calls` rows older than 7 days.
 * Called once per workflow run rather than after every insert, since a run
 * only ever adds a bounded handful of rows. Never throws.
 */
export async function pruneLlmCalls(env: Env): Promise<void> {
  try {
    await env.DB.prepare("DELETE FROM llm_calls WHERE ts < ?")
      .bind(Date.now() - RETENTION_MS)
      .run();
  } catch (error) {
    console.error("llm_calls retention delete failed:", error);
  }
}
