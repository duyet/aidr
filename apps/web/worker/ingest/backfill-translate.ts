import {
  buildMissingTranslationQuery,
  buildStoredTranslationQuery,
  RECHECK_TRANSLATE_CAP,
  RECHECK_TRANSLATE_WINDOW_SEC,
} from "../backfill.js";
import { prepareLoggedTranslationUpsert } from "../d1-bind.js";
import {
  TRANSLATE_BATCH_SIZE,
  type TranslateInput,
  translatedRowIssues,
  translateItems,
} from "../llm.js";
import { recordStep } from "../run-stats.js";
import {
  mergeViEnglish,
  tallyViEnglish,
  type ViEnglishRow,
  type ViEnglishTally,
} from "../translation-english.js";
import { loadActiveRules } from "../translation-knowledge.js";
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
  /** Set on a stored row the draft check flagged: its issue count, which a
   * retry must beat before it replaces the row. */
  storedIssues?: number;
}

interface StoredTranslationRow extends MissingTranslationRow {
  vi_title: string;
  vi_summary: string | null;
}

function translateInput(row: MissingTranslationRow, i: number): TranslateInput {
  return {
    i,
    title: row.title,
    summary: row.summary ?? undefined,
    sourceLang: backfillSourceLang(row.source_lang),
  };
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
  const flaggedTranslations = await safeStep(
    step,
    "backfill-translate-recheck-load",
    [] as MissingTranslationRow[],
    async () => {
      const since =
        Math.floor(Date.now() / 1000) - RECHECK_TRANSLATE_WINDOW_SEC;
      const [{ results }, rules] = await Promise.all([
        env.DB.prepare(buildStoredTranslationQuery())
          .bind(since)
          .all<StoredTranslationRow>(),
        loadActiveRules(env),
      ]);
      const missingIds = new Set(missingTranslations.map((row) => row.id));
      const flagged: MissingTranslationRow[] = [];
      for (const { vi_title, vi_summary, ...row } of results ?? []) {
        if (flagged.length >= RECHECK_TRANSLATE_CAP) break;
        if (missingIds.has(row.id)) continue;
        const issues = translatedRowIssues(
          translateInput(row, 0),
          { title: vi_title, summary: vi_summary ?? "" },
          false,
          rules
        ).length;
        if (issues > 0) flagged.push({ ...row, storedIssues: issues });
      }
      return flagged;
    }
  );
  const pending = [...missingTranslations, ...flaggedTranslations];

  let translatedCount = 0;
  let tokens = 0;
  let viEnglish: ViEnglishTally = {};
  for (const offset of sliceOffsets(pending.length, TRANSLATE_BATCH_SIZE)) {
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
          const rows = pending.slice(offset, offset + TRANSLATE_BATCH_SIZE);
          let count = 0;
          let partTokens = 0;
          const written: ViEnglishRow[] = [];
          try {
            const inputs = rows.map(translateInput);
            const translated = await translateItems(env, inputs);
            const rules = rows.some((row) => row.storedIssues !== undefined)
              ? await loadActiveRules(env)
              : [];
            for (const result of translated) {
              partTokens += result.tokens;
              const row = rows[result.i];
              if (!row || !result.title) continue;
              const title = result.title;
              const summary = result.summary ?? "";
              if (
                row.storedIssues !== undefined &&
                translatedRowIssues(
                  inputs[result.i],
                  { title, summary },
                  false,
                  rules
                ).length >= row.storedIssues
              )
                continue;
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
    pending.length,
    translatedCount
  );
  recordStep(steps, "backfill-translate", summary, detail);
  return { translated: translatedCount, tokens, viEnglish };
}
