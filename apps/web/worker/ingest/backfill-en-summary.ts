import {
  buildMissingEnSummaryQuery,
  EN_SUMMARY_BATCH_SIZE,
  EN_SUMMARY_NO_TEXT,
  EN_SUMMARY_UPDATE_SQL,
} from "../en-summary.js";
import { sentSource, summarizeEnglish } from "../llm.js";
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

interface RowRejection {
  id: string;
  issues: string[];
}

/** Rows named in the step note; the rest are counted. */
const NOTE_MAX_ROWS = 3;

/** True when boilerplate stripping (`sentSource`, what the model would see)
 * leaves no summary text, e.g. a bare byline. */
function hasNoText(row: MissingEnSummaryRow): boolean {
  return !sentSource(
    { i: 0, title: row.title, summary: row.summary, sourceLang: "en" },
    false
  ).summary;
}

function capped(parts: readonly string[], separator: string): string {
  const more = parts.length - NOTE_MAX_ROWS;
  return `${parts.slice(0, NOTE_MAX_ROWS).join(separator)}${more > 0 ? `${separator}+${more} more` : ""}`;
}

function stepNote(input: {
  noTextIds: readonly string[];
  rejected: readonly RowRejection[];
  unanswered: boolean;
}): string | undefined {
  const parts = [
    input.noTextIds.length > 0
      ? `no text after boilerplate: ${capped(
          input.noTextIds.map((id) => id.slice(0, 8)),
          ", "
        )}`
      : "",
    input.rejected.length > 0
      ? `rejected ${capped(
          input.rejected.map(
            (r) => `${r.id.slice(0, 8)}: ${r.issues.join(", ")}`
          ),
          "; "
        )}`
      : "",
    input.unanswered
      ? "summarizeEnglish returned no usable rows; raw summaries stay on screen"
      : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : undefined;
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

  const noText = missing.filter(hasNoText);
  const candidates = missing.filter((row) => !noText.includes(row));
  if (noText.length > 0) {
    await safeStep(step, "backfill-en-summary-no-text", 0, async () => {
      for (const row of noText) {
        await env.DB.prepare(EN_SUMMARY_UPDATE_SQL)
          .bind(
            EN_SUMMARY_NO_TEXT,
            row.source_revision,
            row.id,
            row.source_revision
          )
          .run();
      }
      return noText.length;
    });
  }

  let written = 0;
  let tokens = 0;
  const rejected: RowRejection[] = [];
  for (const offset of sliceOffsets(candidates.length, EN_SUMMARY_BATCH_SIZE)) {
    let part: { count: number; tokens: number; rejected?: RowRejection[] } = {
      count: 0,
      tokens: 0,
    };
    try {
      part = await llmStep(
        step,
        env,
        runId,
        `backfill-en-summary-${offset}`,
        { count: 0, tokens: 0, rejected: [] as RowRejection[] },
        async () => {
          const rows = candidates.slice(offset, offset + EN_SUMMARY_BATCH_SIZE);
          let count = 0;
          let partTokens = 0;
          let partRejected: RowRejection[] = [];
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
            partRejected = out.rejected.flatMap((r) => {
              const row = rows[r.i];
              return row ? [{ id: row.id, issues: r.issues }] : [];
            });
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
          return { count, tokens: partTokens, rejected: partRejected };
        },
        { config: BACKFILL_TRANSLATE_STEP }
      );
    } catch (error) {
      console.error(`backfill-en-summary-${offset} step failed:`, error);
    }
    written += part.count;
    tokens += part.tokens;
    // A step output cached before `rejected` existed replays without it.
    rejected.push(...(part.rejected ?? []));
  }

  const action = [
    candidates.length > 0
      ? `wrote ${written}/${candidates.length} English summaries`
      : "",
    noText.length > 0 ? `skipped ${noText.length} with no text` : "",
  ]
    .filter(Boolean)
    .join(", ");
  recordStep(
    steps,
    "backfill-en-summary",
    action || "0 candidates",
    stepNote({
      noTextIds: noText.map((row) => row.id),
      rejected,
      unanswered:
        candidates.length > 0 && written === 0 && rejected.length === 0,
    })
  );
  return { written, tokens };
}
