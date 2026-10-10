import { reportPipelineException } from "../bugsink.js";
import {
  dispatchStoryNotifications,
  type NotifyChannelReason,
  summarizeNotifyReasons,
} from "../notify/index.js";
import { recordStep } from "../run-stats.js";
import { sendDailyTldr } from "../subscribe/send.js";
import { sanitizeError } from "../telemetry-safe.js";
import {
  ensureDailyTldr,
  previewDailyTldr,
  summarizeTldrPreview,
} from "../tldr.js";
import { llmStep, safeErrorMessage, safeStep } from "../workflow-step.js";
import { type IngestContext, TLDR_STEP } from "./context.js";
import { DRY_RUN_SKIP_REASON } from "./mode.js";

export type TldrPreviewSummary = ReturnType<typeof summarizeTldrPreview>;

/** Writes today's `tldr_snapshots` edition if it is due. A dry run builds
 * the same edition as a preview instead and leaves the live row alone. */
export async function generateTldr(ctx: IngestContext): Promise<{
  generated: boolean;
  tokens: number;
  preview?: TldrPreviewSummary;
}> {
  const { step, env, runId, steps } = ctx;
  if (ctx.mode.dryRun) return previewTldr(ctx);
  const stats = await llmStep(
    step,
    env,
    runId,
    "tldr",
    {
      generated: false,
      tokens: 0,
      reason: "tldr step failed",
    },
    async () => {
      try {
        return await ensureDailyTldr(env);
      } catch (error) {
        console.error("tldr step failed:", error);
        return {
          generated: false,
          tokens: 0,
          reason: sanitizeError(error)?.message ?? "tldr failed",
        };
      }
    },
    { config: TLDR_STEP }
  );
  recordStep(
    steps,
    "tldr",
    stats.generated ? "generated" : "skipped",
    stats.reason
  );
  return stats;
}

/** Dry-run TL;DR: its own step name so a replay never mixes it with the
 * live `tldr` step's memoized result. */
async function previewTldr(ctx: IngestContext): Promise<{
  generated: boolean;
  tokens: number;
  preview?: TldrPreviewSummary;
}> {
  const { step, env, runId, steps } = ctx;
  const stats = await llmStep(
    step,
    env,
    runId,
    "tldr-preview",
    {
      generated: false,
      tokens: 0,
      reason: "tldr preview failed",
      preview: undefined as TldrPreviewSummary | undefined,
    },
    async () => {
      try {
        const preview = await previewDailyTldr(env);
        return {
          generated: preview.generated,
          tokens: preview.tokens,
          reason: preview.reason,
          preview: preview.generated
            ? summarizeTldrPreview(preview)
            : undefined,
        };
      } catch (error) {
        console.error("tldr preview failed:", error);
        return {
          generated: false,
          tokens: 0,
          reason: sanitizeError(error)?.message ?? "tldr preview failed",
          preview: undefined,
        };
      }
    },
    { config: TLDR_STEP }
  );
  recordStep(
    steps,
    "tldr",
    stats.preview ? `preview: ${stats.preview.bullets} bullets` : "skipped",
    `dry run, live snapshot untouched: ${stats.reason}`
  );
  // Never report a preview as a generated edition.
  return { generated: false, tokens: stats.tokens, preview: stats.preview };
}

/** Emails the edition to due subscribers. Never breaks the ingest run. */
export async function sendEmailDigest(ctx: IngestContext): Promise<number> {
  const { step, env, steps } = ctx;
  if (ctx.mode.dryRun) {
    recordStep(steps, "email", "skipped", DRY_RUN_SKIP_REASON);
    return 0;
  }
  const result = await safeStep<{ sent: number; error?: string }>(
    step,
    "email-digest",
    { sent: 0 },
    async () => {
      try {
        return { sent: await sendDailyTldr(env) };
      } catch (error) {
        // Never let a digest-send failure break the ingest workflow, but do
        // not pass it off as "no subscribers" either: report it and record
        // the step as failed. Plain data, so the engine can memoize it.
        console.error("email-digest step failed:", error);
        await reportPipelineException(error, {
          step: "email-digest",
          kind: "exception",
        });
        return { sent: 0, error: safeErrorMessage(error) };
      }
    }
  );
  if (result.error) {
    recordStep(steps, "email", "failed", result.error);
    return 0;
  }
  const emailsSent = result.sent;
  recordStep(
    steps,
    "email",
    emailsSent === 0 ? "skipped" : `sent to ${emailsSent} subscribers`,
    emailsSent === 0 ? "no eligible subscribers this run" : undefined
  );
  return emailsSent;
}

/** `telegram: 3, slack: 1`, or `skipped` when nothing went out. */
export function notifyStepSummary(sent: Record<string, number>): string {
  const total = Object.values(sent).reduce((a, b) => a + b, 0);
  return total === 0
    ? "skipped"
    : Object.entries(sent)
        .map(([channel, n]) => `${channel}: ${n}`)
        .join(", ");
}

export async function notifyChannels(ctx: IngestContext): Promise<{
  sent: Record<string, number>;
  reasons: Record<string, NotifyChannelReason>;
}> {
  const { step, env, steps } = ctx;
  if (ctx.mode.dryRun) {
    recordStep(steps, "notify", "skipped", DRY_RUN_SKIP_REASON);
    return { sent: {}, reasons: {} };
  }
  const result = await safeStep(
    step,
    "notify",
    {
      sent: {} as Record<string, number>,
      reasons: {} as Record<string, NotifyChannelReason>,
    },
    async () => dispatchStoryNotifications(env),
    { rethrowErrors: true }
  );
  recordStep(
    steps,
    "notify",
    notifyStepSummary(result.sent),
    summarizeNotifyReasons(result.reasons)
  );
  return result;
}
