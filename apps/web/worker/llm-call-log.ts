import { type LlmCallLogEntry, redactLlmCallEntry } from "./llm.js";
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

async function ensureTelemetryColumns(db: D1Database): Promise<void> {
  if (telemetryColumnsReady) return;
  for (const sql of TELEMETRY_COLUMNS_SQL) {
    try {
      await db.prepare(sql).run();
    } catch {
      // Column already exists, or table not migrated yet — insert path
      // still falls back to progressively smaller safe INSERTs below.
    }
  }
  telemetryColumnsReady = true;
}

/** Test helper — Worker isolate is long-lived; tests share the module. */
export function resetLlmCallLogSchemaCache(): void {
  telemetryColumnsReady = false;
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
  return async (entry) => {
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
