import type { WorkflowStep } from "cloudflare:workers";
import {
  engineInterruptionReason,
  reportPipelineException,
} from "./bugsink.js";
import { flushLlmCallWrites, withRunLlmCallLogger } from "./llm-call-log.js";
import { isMediaManifestSchemaError } from "./media-schema.js";
import { type RunStepInfo, recordStep } from "./run-stats.js";
import { sanitizeError } from "./telemetry-safe.js";
import type { Env } from "./types.js";

/** Retry/timeout policies a step can be scheduled with. The LLM policies
 * themselves (`LLM_STEP`, `BACKFILL_TRANSLATE_STEP`) live in ingest/context.ts. */
export type StepRetryConfig = {
  retries: {
    limit: number;
    delay: number;
    backoff?: "linear" | "exponential" | "constant";
  };
  timeout?: string;
};

/** Everything `safeStep` needs beyond the four required arguments.
 *
 * An object rather than more positionals: the step log is only sometimes
 * relevant and `rethrowErrors` is a bare `true`/`false`, so a sixth and
 * seventh positional argument would be one `undefined` apart from a boolean
 * and impossible to read at the call site. */
export interface StepOptions {
  /** Retry/timeout policy the step is scheduled with. Defaults to the
   * engine's own, which for a 4-minute LLM step is not what we want. */
  config?: StepRetryConfig;
  /** This run's step line (`IngestContext.steps`). An engine interruption is
   * recorded here; without it the run would look like a plain success. */
  steps?: RunStepInfo[];
  /** Rethrow instead of returning `fallback`, for the steps (write-d1,
   * notify, backfill-content) whose failure the caller handles itself. */
  rethrowErrors?: boolean;
}

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
  options: StepOptions = {}
): Promise<T> {
  const { config, steps, rethrowErrors = false } = options;
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
    // The engine can end a step without this code failing: a deploy resetting
    // the Workflow's Durable Object, an instance that went away under an
    // in-flight call, an internal engine fault, or a step that outran its
    // timeout. Those are not app bugs, so `reportPipelineException` drops
    // them — record the short reason on the run's step line instead, which is
    // where the signal has to live once the Bugsink report is gone.
    const interruption = engineInterruptionReason(error);
    if (interruption) {
      if (steps) recordStep(steps, name, "interrupted", interruption);
      console.warn(
        `${name} step interrupted by the workflow engine: ${interruption}`
      );
      return fallback;
    }
    console.error(`${name} step failed:`, safeErrorMessage(error));
    await reportPipelineException(error, { step: name, kind: "exception" });
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
 *
 * `options` mirrors `safeStep` — see there.
 */
export async function llmStep<T>(
  step: WorkflowStep,
  env: Env,
  runId: string,
  name: string,
  fallback: T,
  closure: () => Promise<T>,
  options?: StepOptions
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
    options
  );
}
