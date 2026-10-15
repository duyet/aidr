/**
 * Runs the model same-story check (`check.ts`) inside the Worker, on the
 * production chain with ingest's cluster call limits, and stores one verdict
 * per story in `unmerge_checks`. Only stories the dangling plan would
 * publish and that have no current verdict are checked, so a second run
 * with nothing new calls no model. It stops at the call cap, at the time
 * budget, after any 429 (#656), and when the chain is exhausted; a rerun
 * resumes from the stored verdicts.
 */
import { requestClusters } from "../dedupe.js";
import { setLlmCallLogger, withLlmCallContext } from "../llm.js";
import { createD1LlmCallLogger, flushLlmCallWrites } from "../llm-call-log.js";
import { sanitizeError } from "../telemetry-safe.js";
import type { Env } from "../types.js";
import {
  batchPrompt,
  CHECK_EXISTING_WINDOW,
  CHECK_VERSION,
  type CheckRunResult,
  type CheckStop,
  type CheckVerdict,
  judgeBatch,
  noEvidenceVerdict,
} from "./check.js";
import { d1Select, loadCheckPlan } from "./load.js";
import type { DanglingDecision, DanglingSnapshot } from "./plan.js";

/** No new batch starts after this much of the request. */
export const CHECK_TIME_BUDGET_MS = 120_000;

const RATE_LIMITED = /\b429\b|rate limit cooldown/;

function stopFor(error: unknown): CheckStop {
  const message = error instanceof Error ? error.message : String(error);
  return RATE_LIMITED.test(message) ? "rate-limited" : "chain-exhausted";
}

function upsertVerdict(
  env: Env,
  verdict: CheckVerdict,
  model: string | null,
  operationId: string,
  nowMs: number
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO unmerge_checks (story, version, verdict, matches, dropped,
       sent, model, operation_id, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (story) DO UPDATE SET version = excluded.version,
       verdict = excluded.verdict, matches = excluded.matches,
       dropped = excluded.dropped, sent = excluded.sent,
       model = excluded.model, operation_id = excluded.operation_id,
       checked_at = excluded.checked_at`
  ).bind(
    verdict.story,
    CHECK_VERSION,
    verdict.verdict,
    JSON.stringify(verdict.matches),
    JSON.stringify(verdict.dropped),
    JSON.stringify(verdict.sent),
    model,
    operationId,
    nowMs
  );
}

/**
 * Checks pending stories batch by batch. A batch's verdicts are written
 * only after every call of it was served with a well-formed answer, so a
 * failure never reads as "clear".
 */
export async function runDanglingCheck(
  env: Env,
  input: {
    snapshot: DanglingSnapshot;
    decisions: readonly DanglingDecision[];
    maxCalls: number;
    operationId: string;
  }
): Promise<CheckRunResult> {
  const startedAt = Date.now();
  const plan = await loadCheckPlan(
    d1Select(env.DB),
    input.snapshot,
    input.decisions,
    startedAt
  );
  const result: CheckRunResult = {
    operationId: input.operationId,
    calls: 0,
    stored: { noEvidence: 0, clear: 0, match: 0 },
    pending: plan.work.length,
    pendingCalls: plan.calls,
    stoppedBy: null,
  };

  const noEvidence = plan.work.filter((w) => w.live.length === 0);
  if (noEvidence.length > 0) {
    await env.DB.batch(
      noEvidence.map((w) =>
        upsertVerdict(
          env,
          noEvidenceVerdict(w),
          null,
          input.operationId,
          Date.now()
        )
      )
    );
    result.stored.noEvidence = noEvidence.length;
  }

  let rateLimited = false;
  const d1Logger = createD1LlmCallLogger(env, input.operationId);
  setLlmCallLogger((entry) => {
    if (RATE_LIMITED.test(entry.error ?? "")) rateLimited = true;
    return d1Logger(entry);
  });
  try {
    for (const batch of plan.batches) {
      if (result.calls + batch.chunks.length > input.maxCalls) {
        result.stoppedBy = "call-cap";
        break;
      }
      if (Date.now() - startedAt > CHECK_TIME_BUDGET_MS) {
        result.stoppedBy = "time-budget";
        break;
      }
      const prompt = batchPrompt(batch);
      const models = new Set<string>();
      const clusters = [];
      try {
        for (const existing of prompt.calls) {
          result.calls++;
          const served = await withLlmCallContext(input.operationId, () =>
            requestClusters(env, prompt.newItems, existing, {
              task: "unmerge-dup-check",
              existingWindow: CHECK_EXISTING_WINDOW,
            })
          );
          if (!served.wellFormed) {
            result.stoppedBy = "bad-output";
            result.failure = `${served.model} answered without a clusters array`;
            break;
          }
          models.add(served.model);
          clusters.push(...served.clusters);
        }
      } catch (error) {
        result.stoppedBy = stopFor(error);
        result.failure = sanitizeError(error)?.message ?? result.stoppedBy;
      }
      if (result.stoppedBy) break;
      const verdicts = judgeBatch(batch, prompt, clusters);
      const model = [...models].join(",");
      await env.DB.batch(
        verdicts.map((verdict) =>
          upsertVerdict(env, verdict, model, input.operationId, Date.now())
        )
      );
      for (const verdict of verdicts) result.stored[verdict.verdict]++;
      if (rateLimited) {
        result.stoppedBy = "rate-limited";
        break;
      }
    }
  } finally {
    await flushLlmCallWrites();
  }
  return result;
}
