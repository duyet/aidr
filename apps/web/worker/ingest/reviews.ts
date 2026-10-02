import { isMediaManifestSchemaError } from "../media-schema.js";
import { recordStep } from "../run-stats.js";
import { reviewPendingSubmissions } from "../submissions.js";
import { reviewPendingSuggestions } from "../suggestions.js";
import {
  ratePendingTranslations,
  TranslationReviewSchemaError,
} from "../translation-qa.js";
import { llmStep } from "../workflow-step.js";
import { type IngestContext, LLM_STEP } from "./context.js";

export interface QaStats {
  rated: number;
  adjusted: number;
  tokens: number;
  error?: string;
}

export function qaStepSummary(stats: QaStats): string {
  if (stats.error) return stats.error;
  return stats.rated === 0
    ? "0 pending translations"
    : `rated ${stats.rated} translations, adjusted ${stats.adjusted}`;
}

/** LLM QA of pending VI translations. A missing review table is reported
 * by name so the operator knows which migration to apply. */
export async function qaTranslations(ctx: IngestContext): Promise<QaStats> {
  const { step, env, runId, steps } = ctx;
  const stats: QaStats = await llmStep(
    step,
    env,
    runId,
    "qa-translations",
    { rated: 0, adjusted: 0, tokens: 0, error: "" } as QaStats,
    async () => {
      try {
        return await ratePendingTranslations(env);
      } catch (error) {
        if (error instanceof TranslationReviewSchemaError) {
          return {
            rated: 0,
            adjusted: 0,
            tokens: 0,
            error: "schema missing; apply migration 0023",
          };
        }
        console.error("qa-translations step failed");
        return { rated: 0, adjusted: 0, tokens: 0, error: "review failed" };
      }
    },
    { config: LLM_STEP }
  );
  recordStep(steps, "qa-translations", qaStepSummary(stats));
  return stats;
}

export async function reviewSuggestions(
  ctx: IngestContext
): Promise<{ reviewed: number; tokens: number }> {
  const { step, env, runId, steps } = ctx;
  const stats = await llmStep(
    step,
    env,
    runId,
    "review-suggestions",
    { reviewed: 0, tokens: 0 },
    async () => {
      try {
        return await reviewPendingSuggestions(env);
      } catch (error) {
        console.error("review-suggestions step failed:", error);
        return { reviewed: 0, tokens: 0 };
      }
    }
  );
  recordStep(
    steps,
    "review-suggestions",
    stats.reviewed === 0
      ? "0 pending suggestions"
      : `reviewed ${stats.reviewed} suggestions`
  );
  return stats;
}

export async function reviewSubmissions(
  ctx: IngestContext
): Promise<{ reviewed: number; tokens: number }> {
  const { step, env, runId, steps } = ctx;
  const stats = await llmStep(
    step,
    env,
    runId,
    "review-submissions",
    { reviewed: 0, tokens: 0 },
    async () => {
      try {
        return await reviewPendingSubmissions(env);
      } catch (error) {
        if (isMediaManifestSchemaError(error)) throw error;
        console.error("review-submissions step failed:", error);
        return { reviewed: 0, tokens: 0 };
      }
    }
  );
  recordStep(
    steps,
    "review-submissions",
    stats.reviewed === 0
      ? "0 pending submissions"
      : `reviewed ${stats.reviewed} submissions`
  );
  return stats;
}
