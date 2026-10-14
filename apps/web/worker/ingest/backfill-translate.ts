import { buildMissingTranslationQuery } from "../backfill.js";
import { prepareLoggedTranslationUpsert } from "../d1-bind.js";
import { TRANSLATE_BATCH_SIZE, translateItems } from "../llm.js";
import { recordStep } from "../run-stats.js";
import {
  mergeViEnglish,
  tallyViEnglish,
  type ViEnglishRow,
  type ViEnglishTally,
} from "../translation-english.js";
import { llmStep, safeStep } from "../workflow-step.js";
import {
  backfillSourceLang,
  backfillTranslateSummary,
  sliceOffsets,
} from "./backfill.js";
import { BACKFILL_TRANSLATE_STEP, type IngestContext } from "./context.js";

interface MissingTranslationRow {
  id: string;
  title: string;
  summary: string | null;
  source_lang: string;
}

/**
 * Translates whatever summaries exist (including ones backfill-content just
 * filled) but don't have a Vietnamese translation yet. Load once, then one
 * durable step per `TRANSLATE_BATCH_SIZE` slice so a successful batch is
 * checkpointed even if a later slice times out.
 */
export async function backfillTranslations(
  ctx: IngestContext
): Promise<{ translated: number; tokens: number; viEnglish: ViEnglishTally }> {
  const { step, env, runId, steps } = ctx;
  const missingTranslations = await safeStep(
    step,
    "backfill-translate-load",
    [] as MissingTranslationRow[],
    async () => {
      const { results } = await env.DB.prepare(
        buildMissingTranslationQuery()
      ).all<MissingTranslationRow>();
      return results ?? [];
    }
  );

  let translatedCount = 0;
  let tokens = 0;
  let viEnglish: ViEnglishTally = {};
  for (const offset of sliceOffsets(
    missingTranslations.length,
    TRANSLATE_BATCH_SIZE
  )) {
    let part: { count: number; tokens: number; viEnglish?: ViEnglishTally } = {
      count: 0,
      tokens: 0,
    };
    try {
      part = await llmStep(
        step,
        env,
        runId,
        `backfill-translate-${offset}`,
        { count: 0, tokens: 0, viEnglish: {} },
        async () => {
          const rows = missingTranslations.slice(
            offset,
            offset + TRANSLATE_BATCH_SIZE
          );
          let count = 0;
          let partTokens = 0;
          const written: ViEnglishRow[] = [];
          try {
            const translated = await translateItems(
              env,
              rows.map((row, i) => ({
                i,
                title: row.title,
                summary: row.summary ?? undefined,
                sourceLang: backfillSourceLang(row.source_lang),
              }))
            );
            for (const result of translated) {
              partTokens += result.tokens;
              const row = rows[result.i];
              if (!row || !result.title) continue;
              const title = result.title;
              const summary = result.summary ?? "";
              await env.DB.batch(
                prepareLoggedTranslationUpsert(env.DB, {
                  id: row.id,
                  lang: "vi",
                  sourceLang: backfillSourceLang(row.source_lang),
                  targetLang: "vi",
                  title,
                  summary,
                  reason: "backfill",
                })
              );
              count++;
              written.push({ model: result.model, summary });
            }
          } catch (error) {
            console.error("backfill-translate batch failed:", error);
          }
          return {
            count,
            tokens: partTokens,
            viEnglish: tallyViEnglish(written),
          };
        },
        { config: BACKFILL_TRANSLATE_STEP }
      );
    } catch (error) {
      console.error(`backfill-translate-${offset} step failed:`, error);
    }
    translatedCount += part.count;
    tokens += part.tokens;
    // A step cached before this field existed replays without it.
    viEnglish = mergeViEnglish(viEnglish, part.viEnglish ?? {});
  }

  const { summary, detail } = backfillTranslateSummary(
    missingTranslations.length,
    translatedCount
  );
  recordStep(steps, "backfill-translate", summary, detail);
  return { translated: translatedCount, tokens, viEnglish };
}
