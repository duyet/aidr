import {
  dispatchStoryNotifications,
  type NotifyChannelReason,
  summarizeNotifyReasons,
} from "../notify/index.js";
import { recordStep } from "../run-stats.js";
import { sendDailyTldr } from "../subscribe/send.js";
import { sanitizeError } from "../telemetry-safe.js";
import { ensureDailyTldr } from "../tldr.js";
import { llmStep, safeStep } from "../workflow-step.js";
import { type IngestContext, LLM_STEP } from "./context.js";

/** Writes today's `tldr_snapshots` edition if it is due. */
export async function generateTldr(
  ctx: IngestContext
): Promise<{ generated: boolean; tokens: number }> {
  const { step, env, runId, steps } = ctx;
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
    LLM_STEP
  );
  recordStep(
    steps,
    "tldr",
    stats.generated ? "generated" : "skipped",
    stats.reason
  );
  return stats;
}

/** Emails the edition to due subscribers. Never breaks the ingest run. */
export async function sendEmailDigest(ctx: IngestContext): Promise<number> {
  const { step, env, steps } = ctx;
  const emailsSent = await safeStep(step, "email-digest", 0, async () => {
    try {
      return await sendDailyTldr(env);
    } catch (error) {
      // Never let a digest-send failure break the ingest workflow.
      console.error("email-digest step failed:", error);
      return 0;
    }
  });
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
  const result = await safeStep(
    step,
    "notify",
    {
      sent: {} as Record<string, number>,
      reasons: {} as Record<string, NotifyChannelReason>,
    },
    async () => dispatchStoryNotifications(env),
    undefined,
    true
  );
  recordStep(
    steps,
    "notify",
    notifyStepSummary(result.sent),
    summarizeNotifyReasons(result.reasons)
  );
  return result;
}
