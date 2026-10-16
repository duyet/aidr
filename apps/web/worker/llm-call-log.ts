import {
  type LlmCallLogEntry,
  redactLlmCallEntry,
  setLlmCallLogger,
  withLlmCallContext,
} from "./llm.js";
import { sanitizeError } from "./telemetry-safe.js";
import type { Env } from "./types.js";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

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
export function resetLlmCallLogState(): void {
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
        const route =
          safeEntry.route && safeEntry.route.length > 0
            ? JSON.stringify(safeEntry.route.slice(0, 5))
            : null;
        await env.DB.prepare(
          `INSERT INTO llm_calls (
             ts, task, model, ok, tokens, duration_ms, error,
             prompt_chars, response_snippet,
             prompt_tokens, completion_tokens, cached_tokens,
             run_id, error_code, error_status, route, provider, call_id,
             cost_usd, request_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            safeEntry.responseSnippet,
            safeEntry.promptTokens,
            safeEntry.completionTokens,
            safeEntry.cachedTokens,
            runId,
            safeError?.code ?? null,
            safeError?.status ?? null,
            route,
            safeEntry.provider ?? null,
            safeEntry.callId ?? null,
            safeEntry.costUsd ?? null,
            safeEntry.requestId ?? null
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
