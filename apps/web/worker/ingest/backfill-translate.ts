import {
  BACKFILL_TRANSLATE_CAP,
  buildMissingTranslationQuery,
  buildStoredTranslationQuery,
  MARK_TRANSLATION_RECHECKED_SQL,
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

interface SliceResult {
  count: number;
  tokens: number;
  viEnglish?: ViEnglishTally;
  /** Some row came back without a title: a 429, a spent credit or a
   * timeout most of the time. Absent on a step cached before it existed. */
  failed?: boolean;
}

/** One durable step: translate `rows` and write each result through the
 * logged upsert, so the replaced VI text lands in `item_content_log`. A
 * re-checked row is marked tried before the call and is replaced only by a
 * retry with fewer draft issues. */
async function translateSlice(
  ctx: IngestContext,
  name: string,
  rows: MissingTranslationRow[]
): Promise<SliceResult> {
  const { step, env, runId } = ctx;
  return llmStep(
    step,
    env,
    runId,
    name,
    { count: 0, tokens: 0, viEnglish: {}, failed: true } as SliceResult,
    async () => {
      let count = 0;
      let partTokens = 0;
      let titled = 0;
      const written: ViEnglishRow[] = [];
      let failed = false;
      try {
        const rechecked = rows.filter((row) => row.storedIssues !== undefined);
        if (rechecked.length > 0) {
          const now = Math.floor(Date.now() / 1000);
          await env.DB.batch(
            rechecked.map((row) =>
              env.DB.prepare(MARK_TRANSLATION_RECHECKED_SQL).bind(row.id, now)
            )
          );
        }
        const inputs = rows.map(translateInput);
        const translated = await translateItems(env, inputs);
        const rules = rechecked.length > 0 ? await loadActiveRules(env) : [];
        for (const result of translated) {
          partTokens += result.tokens;
          const row = rows[result.i];
          if (!row || !result.title) continue;
          titled++;
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
        failed = titled < rows.length;
      } catch (error) {
        console.error("backfill-translate batch failed:", error);
        failed = true;
      }
      return {
        count,
        tokens: partTokens,
        viEnglish: tallyViEnglish(written),
        failed,
      };
    },
    { config: BACKFILL_TRANSLATE_STEP }
  );
}

/** The newest `RECHECK_TRANSLATE_CAP` stored VI rows of the window, not
 * re-checked before, that the draft check flags. */
async function loadFlaggedTranslations(
  ctx: IngestContext
): Promise<MissingTranslationRow[]> {
  const { step, env } = ctx;
  return safeStep(
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
      const flagged: MissingTranslationRow[] = [];
      for (const { vi_title, vi_summary, ...row } of results ?? []) {
        if (flagged.length >= RECHECK_TRANSLATE_CAP) break;
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
}

/**
 * Translates whatever summaries exist (including ones backfill-content just
 * filled) but don't have a Vietnamese translation yet. Load once, then one
 * durable step per `TRANSLATE_BATCH_SIZE` slice so a successful batch is
 * checkpointed even if a later slice times out. Then at most one batch
 * re-translates stored rows the draft check flags (#1021). It is skipped
 * when the run hit `BACKFILL_TRANSLATE_CAP` or a translate batch failed, so
 * the recheck only spends quota the run did not need.
 */
export async function backfillTranslations(
  ctx: IngestContext
): Promise<{ translated: number; tokens: number; viEnglish: ViEnglishTally }> {
  const { step, env, steps } = ctx;
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
  let failed = false;
  const run = async (name: string, rows: MissingTranslationRow[]) => {
    try {
      const part = await translateSlice(ctx, name, rows);
      translatedCount += part.count;
      tokens += part.tokens;
      // A step cached before this field existed replays without it.
      viEnglish = mergeViEnglish(viEnglish, part.viEnglish ?? {});
      failed ||= part.failed === true;
    } catch (error) {
      console.error(`${name} step failed:`, error);
      failed = true;
    }
  };

  for (const offset of sliceOffsets(
    missingTranslations.length,
    TRANSLATE_BATCH_SIZE
  )) {
    await run(
      `backfill-translate-${offset}`,
      missingTranslations.slice(offset, offset + TRANSLATE_BATCH_SIZE)
    );
  }

  let flagged: MissingTranslationRow[] = [];
  if (missingTranslations.length < BACKFILL_TRANSLATE_CAP && !failed) {
    flagged = await loadFlaggedTranslations(ctx);
    if (flagged.length > 0) await run("backfill-translate-recheck", flagged);
  }

  const { summary, detail } = backfillTranslateSummary(
    missingTranslations.length + flagged.length,
    translatedCount
  );
  recordStep(steps, "backfill-translate", summary, detail);
  return { translated: translatedCount, tokens, viEnglish };
}
