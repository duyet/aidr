import { SITE_URL } from "../../src/lib/site.js";
import {
  type InboundStats,
  processPendingInboundEmails,
} from "../email-intake/process.js";
import { recordStep } from "../run-stats.js";
import { safeStep } from "../workflow-step.js";
import type { IngestContext } from "./context.js";

const EMPTY: InboundStats = {
  processed: 0,
  submissions: 0,
  suggestions: 0,
  comments: 0,
};

/** Mail sent to submit@aidr.today, stored by the `aidr-email` Worker, becomes
 * submissions/suggestions/comments here (no LLM; review-suggestions and
 * review-submissions judge them later in the same run). A dry run only
 * classifies the pending batch: no row is written and no ack is sent. */
export async function processInboundEmail(
  ctx: IngestContext
): Promise<InboundStats> {
  const { step, env, steps } = ctx;
  const dryRun = ctx.mode.dryRun;
  const stats = await safeStep(step, "inbound-email", EMPTY, () =>
    processPendingInboundEmails(env, SITE_URL, { dryRun })
  );
  const counts = `${stats.submissions} submissions, ${stats.suggestions} suggestions, ${stats.comments} comments`;
  recordStep(
    steps,
    "inbound-email",
    stats.processed === 0
      ? "0 pending emails"
      : dryRun
        ? `dry run: would process ${stats.processed} emails (${counts})`
        : `processed ${stats.processed} emails (${counts})`
  );
  return stats;
}
