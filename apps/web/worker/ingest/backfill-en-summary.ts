import {
  buildMissingEnSummaryQuery,
  EN_SUMMARY_BATCH_SIZE,
  EN_SUMMARY_UPDATE_SQL,
} from "../en-summary.js";
import { summarizeEnglish } from "../llm.js";
import { recordStep } from "../run-stats.js";
import { llmStep, safeStep } from "../workflow-step.js";
import { sliceOffsets } from "./backfill.js";
import { BACKFILL_TRANSLATE_STEP, type IngestContext } from "./context.js";

interface MissingEnSummaryRow {
  id: string;
  title: string;
  summary: string;
  source_revision: number;
}

/**
 * Writes the LLM English summary (`items.summary_en`) for English-source
 * stories that lack one for their current source revision, newest first.
 * Runs after `write` and `backfill-content`, so fresh stories and replaced
 * teasers get theirs before tldr/email/notify in the same run. Never touches
 * `items.summary`. Same load + one durable step per slice shape as
 * backfill-translate.
 */
export async function backfillEnSummaries(
  ctx: IngestContext
): Promise<{ written: number; tokens: number }> {
  const { step, env, runId, steps } = ctx;
  const missing = await safeStep(
    step,
    "backfill-en-summary-load",
    [] as MissingEnSummaryRow[],
    async () => {
      const { results } = await env.DB.prepare(
        buildMissingEnSummaryQuery()
      ).all<MissingEnSummaryRow>();
      return results ?? [];
    }
  );

  let written = 0;
  let tokens = 0;
  for (const offset of sliceOffsets(missing.length, EN_SUMMARY_BATCH_SIZE)) {
    let part = { count: 0, tokens: 0 };
    try {
      part = await llmStep(
        step,
        env,
        runId,
        `backfill-en-summary-${offset}`,
        { count: 0, tokens: 0 },
        async () => {
          const rows = missing.slice(offset, offset + EN_SUMMARY_BATCH_SIZE);
          let count = 0;
          let partTokens = 0;
          try {
            const out = await summarizeEnglish(
              env,
              rows.map((row, i) => ({
                i,
                title: row.title,
                summary: row.summary,
              }))
            );
            partTokens = out.tokens;
            for (const result of out.results) {
              const row = rows[result.i];
              if (!row) continue;
              const res = await env.DB.prepare(EN_SUMMARY_UPDATE_SQL)
                .bind(
                  result.summary,
                  row.source_revision,
                  row.id,
                  row.source_revision
                )
                .run();
              if ((res.meta?.changes ?? 0) > 0) count++;
            }
          } catch (error) {
            console.error("backfill-en-summary batch failed:", error);
          }
          return { count, tokens: partTokens };
        },
        { config: BACKFILL_TRANSLATE_STEP }
      );
    } catch (error) {
      console.error(`backfill-en-summary-${offset} step failed:`, error);
    }
    written += part.count;
    tokens += part.tokens;
  }

  recordStep(
    steps,
    "backfill-en-summary",
    missing.length === 0
      ? "0 candidates"
      : `wrote ${written}/${missing.length} English summaries`,
    missing.length > 0 && written === 0
      ? "summarizeEnglish returned no usable rows; raw summaries stay on screen"
      : undefined
  );
  return { written, tokens };
}
