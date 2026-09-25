import type { WorkflowStep } from "cloudflare:workers";
import { flushLlmCallWrites, withRunLlmCallLogger } from "./llm-call-log.js";
import { isMediaManifestSchemaError } from "./media-schema.js";
import { sanitizeError } from "./telemetry-safe.js";
import type { Env } from "./types.js";

/** Retry/timeout policies a step can be scheduled with. The LLM policies
 * themselves (`LLM_STEP`, `BACKFILL_TRANSLATE_STEP`) stay in workflow.ts. */
export type StepRetryConfig = {
  retries: {
    limit: number;
    delay: number;
    backoff?: "linear" | "exponential" | "constant";
  };
  timeout?: string;
};

/** Catch Workflow engine failures (timeout / retries exhausted). Inner
 * try/catch around the callback does not run when `step.do` itself throws,
 * and a failed step with retries:0 can skip later steps including close-run. */
export function safeErrorMessage(error: unknown): string {
  return sanitizeError(error)?.message ?? "unknown error";
}

export async function safeStep<T>(
  step: WorkflowStep,
  name: string,
  fallback: T,
  closure: () => Promise<T>,
  config?: StepRetryConfig,
  rethrowErrors = false
): Promise<T> {
  try {
    const result = config
      ? await (
          step.do as (
            name: string,
            config: StepRetryConfig,
            fn: () => Promise<T>
          ) => Promise<T>
        )(name, config, closure)
      : await (step.do as (name: string, fn: () => Promise<T>) => Promise<T>)(
          name,
          closure
        );
    return result;
  } catch (error) {
    if (rethrowErrors || isMediaManifestSchemaError(error)) throw error;
    console.error(`${name} step failed:`, safeErrorMessage(error));
    return fallback;
  }
}

/**
 * `safeStep` for steps that call an LLM.
 *
 * Three things have to be true for an attempt to reach `llm_calls` with a
 * `run_id` (which is the only thing `/data?tab=runs` and
 * `/api/system/run-attempts` attribute by):
 *
 * 1. the D1 sink is installed in the isolate/context that actually runs the
 *    LLM work — the Workflow engine can execute a `step.do` callback outside
 *    the module-level install done at the top of `run()`, where
 *    `logLlmCall`'s `if (!llmCallLogger) return` no-ops;
 * 2. the run id is in scope, via the async-local context and the sink's
 *    `fallbackRunId` (so identity survives even if the context is dropped);
 * 3. the fire-and-forget inserts have actually landed before the step
 *    resolves, instead of racing the engine's next step or isolate reuse.
 *
 * Only observability is affected: a failing insert is swallowed, and the
 * flush is bounded, so neither can change the pipeline's outcome.
 */
export async function llmStep<T>(
  step: WorkflowStep,
  env: Env,
  runId: string,
  name: string,
  fallback: T,
  closure: () => Promise<T>,
  config?: StepRetryConfig,
  rethrowErrors = false
): Promise<T> {
  return safeStep(
    step,
    name,
    fallback,
    async () => {
      try {
        return await withRunLlmCallLogger(env, runId, closure);
      } finally {
        await flushLlmCallWrites();
      }
    },
    config,
    rethrowErrors
  );
}
