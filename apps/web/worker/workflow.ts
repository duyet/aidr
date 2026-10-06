/**
 * Hourly ingest Workflow: a thin orchestrator. Each pipeline step lives in
 * `worker/ingest/` and records its own run-step line; this file owns the run
 * lifecycle (open-run, run-level error capture, close-run) and the order in
 * which steps run. Step names and order are the Workflow's replay keys —
 * keep them stable.
 */
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { bindSentry, reportPipelineException } from "./bugsink.js";
import { runHealthCheck } from "./health.js";
import { backfillContent } from "./ingest/backfill.js";
import { backfillScores } from "./ingest/backfill-score.js";
import { backfillTranslations } from "./ingest/backfill-translate.js";
import { type IngestContext, LLM_STEP } from "./ingest/context.js";
import { dedupeNewRows } from "./ingest/dedupe.js";
import { enrichNewRows } from "./ingest/enrich.js";
import { fetchSources, loadSources, seedSourceHealth } from "./ingest/fetch.js";
import { processInboundEmail } from "./ingest/inbound-email.js";
import { planMerges } from "./ingest/merge.js";
import {
  ingestModeFromPayload,
  ingestModeStats,
  runChainStep,
  skipUnselectedStep,
} from "./ingest/mode.js";
import {
  generateTldr,
  notifyChannels,
  sendEmailDigest,
  type TldrPreviewSummary,
} from "./ingest/publish.js";
import {
  qaTranslations,
  reviewSubmissions,
  reviewSuggestions,
} from "./ingest/reviews.js";
import { scoreNewRows, tallyScored } from "./ingest/score.js";
import {
  carrySourceStreaks,
  resolveSkipReasons,
  tallySourceOutcomes,
} from "./ingest/source-health.js";
import { learnTopics, normalizeNewRowTopics } from "./ingest/topics.js";
import {
  selectPublishedRows,
  translatePublishedRows,
} from "./ingest/translate.js";
import { writeItems } from "./ingest/write.js";
import { setLlmCallLogger, withLlmCallContext } from "./llm.js";
import { createD1LlmCallLogger, pruneLlmCalls } from "./llm-call-log.js";
import { assertMediaManifestSchema } from "./media-schema.js";
import type { NotifyChannelReason } from "./notify/index.js";
import { pruneSubscribeAttempts } from "./rate-limit.js";
import {
  buildRunStats,
  type RunStepInfo,
  recordStep,
  serializeRunStats,
} from "./run-stats.js";
import type { SourceRunHealth } from "./source-health.js";
import { sanitizeError } from "./telemetry-safe.js";
import { toEpochSeconds } from "./time.js";
import type { Env } from "./types.js";
import {
  ingestRunId,
  persistOpenedWorkflowRun,
  persistWorkflowRun,
} from "./workflow-run.js";
import { safeStep } from "./workflow-step.js";

export class NewsIngestWorkflow extends WorkflowEntrypoint<Env> {
  async run(event: WorkflowEvent<unknown>, step: WorkflowStep) {
    bindSentry(this.env);
    const runId = ingestRunId(event);
    return withLlmCallContext(runId, () =>
      this.runInternal(event, step, runId)
    );
  }

  private async runInternal(
    event: WorkflowEvent<unknown>,
    step: WorkflowStep,
    runId: string
  ) {
    let itemsFetched = 0;
    let itemsNew = 0;
    let runError: string | null = null;
    const bySource: Record<string, number> = {};
    let merged = 0;
    let published = 0;
    let rejected = 0;
    let scoreAndTranslateTokens = 0;
    let backfilledSummaries = 0;
    let backfilledTranslations = 0;
    let backfillTranslateTokens = 0;
    let qaRated = 0;
    let qaAdjusted = 0;
    let qaTokens = 0;
    let suggestionsReviewed = 0;
    let suggestionsTokens = 0;
    let submissionsReviewed = 0;
    let submissionsTokens = 0;
    let tldrGenerated = false;
    let tldrTokens = 0;
    let emailsSent = 0;
    let notified: Record<string, number> = {};
    let notifyReason: Record<string, NotifyChannelReason> = {};
    const steps: RunStepInfo[] = [];
    /** Per-source outcome for this run, seeded for every source by
     *  `seedSourceHealth` and filled in by the fetch/score/partition steps. */
    const sourceHealth: Record<string, SourceRunHealth> = {};
    const mode = ingestModeFromPayload(event.payload);
    const ctx: IngestContext = { step, env: this.env, runId, steps, mode };
    /** Only a run whose fresh-item chain reached translate has a whole
     *  per-source record; a partial or empty map would reset every source's
     *  streak and blank /api/system source health. */
    let sourceHealthComplete = false;
    let tldrPreview: TldrPreviewSummary | undefined;

    // POST /api/admin/ingest `{id}` is the Workflow instance id. Persist
    // that row before prune/fetch/LLM and before any step.do: create() can
    // return while run() is still queued, pruneLlmCalls can run for minutes
    // on a large llm_calls table, and wrapping the first step.do in
    // safeStep can return a fallback without executing the upsert.
    const startedAt = toEpochSeconds(
      event.timestamp instanceof Date ? event.timestamp.getTime() : Date.now()
    );
    await persistOpenedWorkflowRun(
      this.env.DB,
      runId,
      startedAt,
      "open-run",
      ingestModeStats(mode)
    );

    // Installs the D1-backed llm_calls logger so every scoreItems/
    // translateItems/generateTldr call below (and everything else that
    // routes through callAnyrouter) gets an observability row. Plain code,
    // not step.do: re-running it on workflow replay is harmless (it just
    // reinstalls the same closure and re-runs an idempotent DELETE), and
    // it must never affect run-error tracking below.
    //
    // This is only a default for LLM work that happens outside a step
    // callback: the Workflow engine can run a `step.do` callback in a
    // context where this module-level sink (and the run-id context above) is
    // gone, which silently no-ops `logLlmCall` and leaves the run with
    // tokens but zero attributable attempts. Every LLM-calling step
    // therefore goes through `llmStep`, which re-installs the sink *inside*
    // the callback and drains the fire-and-forget inserts before the step
    // resolves. See workflow-step.ts.
    setLlmCallLogger(createD1LlmCallLogger(this.env, runId));

    // Durable duplicate of the open-run upsert. Do not wrap in safeStep:
    // a caught engine yield would skip the callback and look like success.
    await step.do("open-run", async () => {
      await persistOpenedWorkflowRun(
        this.env.DB,
        runId,
        startedAt,
        "open-run",
        ingestModeStats(mode)
      );
      return { id: runId, startedAt };
    });

    await pruneLlmCalls(this.env);
    await pruneSubscribeAttempts(this.env.DB);

    /** Fresh items from sources through the D1 write. Each chain step runs only
     * when the run selected it and every step before it (see `runChainStep`);
     * the caller has already checked `fetch`. Kept inline so this method stays
     * the one place pipeline order lives. */
    const ingestFreshItems = async (): Promise<{
      itemsFetched: number;
      itemsNew: number;
      merged: number;
      published: number;
      rejected: number;
      tokens: number;
      /** Per-source health is only whole (outcomes, skip reasons, carried
       *  streaks) once the chain reached translate. */
      sourceHealthComplete: boolean;
    }> => {
      const result = {
        itemsFetched: 0,
        itemsNew: 0,
        merged: 0,
        published: 0,
        rejected: 0,
        tokens: 0,
        sourceHealthComplete: false,
      };

      // 1. Consume sources.
      const sources = await loadSources(ctx);
      seedSourceHealth(sourceHealth, sources);
      const fetched = await fetchSources(ctx, sources, sourceHealth, bySource);
      result.itemsFetched = fetched.itemsFetched;
      if (!runChainStep(ctx, "dedupe")) return result;

      const dedupedRows = await dedupeNewRows(
        ctx,
        fetched.fetchedBySource,
        sources,
        fetched.itemsFetched
      );
      result.itemsNew = dedupedRows.length;
      const newRows = await enrichNewRows(ctx, dedupedRows);
      if (!runChainStep(ctx, "score")) return result;

      // 2. Score, normalize topics, cluster, translate.
      const scored = await scoreNewRows(ctx, newRows);
      tallyScored(sourceHealth, newRows, scored);

      const now = Date.now();
      const canonicalTagsByItem = await normalizeNewRowTopics(
        ctx,
        newRows,
        scored,
        now
      );
      await learnTopics(ctx, newRows, canonicalTagsByItem, now);
      const mergePlan = await planMerges(
        ctx,
        newRows,
        scored,
        canonicalTagsByItem,
        now
      );
      if (!runChainStep(ctx, "translate")) return result;

      const publishedRows = selectPublishedRows(newRows, scored, mergePlan);
      const translated = await translatePublishedRows(
        ctx,
        newRows,
        publishedRows
      );

      // Plain deterministic derivation from already-memoized step outputs
      // (newRows/scored/mergePlan/translated) — replay-safe the same way
      // publishedRows is, no need for its own step.do.
      result.merged = mergePlan.merged.size;
      result.published = publishedRows.length;
      result.rejected = newRows.length - result.merged - result.published;

      tallySourceOutcomes(sourceHealth, newRows, publishedRows, mergePlan);
      resolveSkipReasons(sourceHealth, fetched.fetchFailures);
      await carrySourceStreaks(ctx, sourceHealth, sources);
      result.sourceHealthComplete = true;

      for (const score of scored.values()) result.tokens += score.tokens;
      for (const translation of translated.values())
        result.tokens += translation.tokens;

      // 3. Persist and re-rank.
      if (runChainStep(ctx, "write")) {
        await writeItems(ctx, {
          newRows,
          scored,
          translated,
          mergePlan,
          canonicalTagsByItem,
          now,
        });
      }
      return result;
    };

    try {
      await assertMediaManifestSchema(this.env.DB);

      // 1–3. Consume sources, score, translate, persist and re-rank.
      if (runChainStep(ctx, "fetch")) {
        const fresh = await ingestFreshItems();
        sourceHealthComplete = fresh.sourceHealthComplete;
        itemsFetched = fresh.itemsFetched;
        itemsNew = fresh.itemsNew;
        merged = fresh.merged;
        published = fresh.published;
        rejected = fresh.rejected;
        scoreAndTranslateTokens += fresh.tokens;
      }

      // 4. Drain backlogs and review queues.
      if (!skipUnselectedStep(ctx, "backfill-content")) {
        backfilledSummaries = await backfillContent(ctx);
      }

      if (!skipUnselectedStep(ctx, "backfill-translate")) {
        const backfillTranslate = await backfillTranslations(ctx);
        backfilledTranslations = backfillTranslate.translated;
        backfillTranslateTokens = backfillTranslate.tokens;
      }

      if (!skipUnselectedStep(ctx, "backfill-score")) {
        const backfillScore = await backfillScores(ctx);
        scoreAndTranslateTokens += backfillScore.tokens;
      }

      if (!skipUnselectedStep(ctx, "qa-translations")) {
        const qaStats = await qaTranslations(ctx);
        qaRated = qaStats.rated;
        qaAdjusted = qaStats.adjusted;
        qaTokens = qaStats.tokens;
      }

      if (!skipUnselectedStep(ctx, "inbound-email")) {
        await processInboundEmail(ctx);
      }

      if (!skipUnselectedStep(ctx, "review-suggestions")) {
        const suggestionsStats = await reviewSuggestions(ctx);
        suggestionsReviewed = suggestionsStats.reviewed;
        suggestionsTokens = suggestionsStats.tokens;
      }

      if (!skipUnselectedStep(ctx, "review-submissions")) {
        const submissionsStats = await reviewSubmissions(ctx);
        submissionsReviewed = submissionsStats.reviewed;
        submissionsTokens = submissionsStats.tokens;
      }

      // 5. Build the edition and publish it. A dry run previews the TL;DR
      // and records email/notify as skipped without calling either sender.
      if (!skipUnselectedStep(ctx, "tldr")) {
        const tldrStats = await generateTldr(ctx);
        tldrGenerated = tldrStats.generated;
        tldrTokens = tldrStats.tokens;
        tldrPreview = tldrStats.preview;
      }

      if (!skipUnselectedStep(ctx, "email")) {
        emailsSent = await sendEmailDigest(ctx);
      }

      if (!skipUnselectedStep(ctx, "notify")) {
        const notifyResult = await notifyChannels(ctx);
        notified = notifyResult.sent;
        notifyReason = notifyResult.reasons;
      }
    } catch (error) {
      // Do not rethrow. Cloudflare Workflows retry a thrown `run()` (and
      // skip later steps, including `record-run` in this finally). A
      // finished ingest must always insert a workflow_runs row so
      // /api/system lastRun/runsToday move.
      runError = sanitizeError(error)?.message ?? "ingest run failed";
      console.error("ingest run failed:", error);
      await reportPipelineException(error, {
        step: "ingest",
        kind: "exception",
      });
    } finally {
      // Before close-run so its steps are the ones evaluated; a durable step
      // so a replay does not raise the same alerts twice.
      const alerts = await safeStep(
        step,
        "health-check",
        [] as string[],
        () => runHealthCheck(this.env, { runId, steps, dryRun: mode.dryRun }),
        { steps }
      );
      recordStep(steps, "close-run", "recording");
      const stats = buildRunStats({
        ...ingestModeStats(mode),
        bySource,
        sourceHealth: sourceHealthComplete ? sourceHealth : undefined,
        steps,
        new: itemsNew,
        merged,
        rejected,
        published,
        tokens:
          scoreAndTranslateTokens +
          backfillTranslateTokens +
          qaTokens +
          suggestionsTokens +
          submissionsTokens +
          tldrTokens,
        backfilledSummaries,
        backfilledTranslations,
        qaRated,
        qaAdjusted,
        suggestionsReviewed,
        submissionsReviewed,
        tldrGenerated,
        emailsSent,
        notified,
        notifyReason,
        alerts,
        tldrPreview,
      });

      const row = {
        id: runId,
        startedAt,
        finishedAt: toEpochSeconds(Date.now()),
        itemsFetched,
        itemsNew,
        error: runError,
        statsJson: serializeRunStats(stats),
      };

      // Durable close so a replay still writes. Direct D1 in finally is a
      // fallback when the engine will not schedule another step.do.
      try {
        await safeStep(
          step,
          "close-run",
          undefined,
          async () => {
            await persistWorkflowRun(this.env.DB, row);
          },
          // No `steps` here: `statsJson` is serialized above, so anything
          // this step records would never reach the run row.
          { config: LLM_STEP }
        );
      } catch (error) {
        console.error("close-run step failed:", error);
      }
      try {
        await persistWorkflowRun(this.env.DB, row);
      } catch (error) {
        console.error("close-run d1 failed:", error);
      }
    }
  }
}
