import {
  BACKFILL_BATCH_SIZE,
  BACKFILL_CONTENT_CAP,
  buildMissingMediaQuery,
  buildMissingSummaryQuery,
  huggingNewsDetailUrl,
  planBackfillUpdate,
} from "../backfill.js";
import {
  buildItemSourceBindArgs,
  nn,
  prepareTranslationQaInvalidation,
} from "../d1-bind.js";
import { fetchOgData } from "../enrich.js";
import { serializeMediaManifest } from "../media.js";
import { isMediaManifestSchemaError } from "../media-schema.js";
import { recordStep } from "../run-stats.js";
import { fetchStoryDetailByUrl } from "../sources/huggingnews.js";
import type { FetchedItem, FetchedItemSource } from "../sources/types.js";
import type { Env } from "../types.js";
import { safeStep } from "../workflow-step.js";
import type { IngestContext } from "./context.js";
import { chunk } from "./fetch.js";
import { INSERT_ITEM_SOURCE_SQL } from "./write.js";

/** First occurrence wins; an item missing both summary and media is
 * backfilled once, not twice in the same run. */
export function uniqueById<T extends { id: string }>(rows: readonly T[]): T[] {
  return rows.filter(
    (row, index, list) =>
      list.findIndex((candidate) => candidate.id === row.id) === index
  );
}

/** `sourceLang` for the translator: only an explicit `vi` flips direction. */
export function backfillSourceLang(value: string): "vi" | "en" {
  return value === "vi" ? "vi" : "en";
}

/** Start offsets of each `size`-item slice. Each offset names its own
 * durable step (`backfill-translate-<offset>`), so they must be stable for a
 * given candidate list across replays. */
export function sliceOffsets(length: number, size: number): number[] {
  const offsets: number[] = [];
  for (let offset = 0; offset < length; offset += size) offsets.push(offset);
  return offsets;
}

export function backfillTranslateSummary(
  attempted: number,
  translated: number
): { summary: string; detail: string | undefined } {
  return {
    summary:
      translated === 0
        ? attempted === 0
          ? "0 candidates"
          : `translated 0/${attempted}`
        : `translated ${translated} summaries`,
    detail:
      attempted > 0 && translated === 0
        ? "translateItems.batch_failed — missing title_vi not backfilled"
        : undefined,
  };
}

interface ContentBackfillRow {
  id: string;
  url: string;
  source_id: string;
  summary: string | null;
  image_url: string | null;
  media_manifest: string | null;
}

/** Fetch + apply one row's backfill. `onPlanned` fires once an update is
 * planned, before any write, so the count matches rows we attempted. */
async function backfillContentRow(
  env: Env,
  row: ContentBackfillRow,
  onPlanned: () => void
): Promise<void> {
  let fetched: {
    summary?: string;
    imageUrl?: string;
    mediaManifest?: FetchedItem["mediaManifest"];
  };
  let sources: FetchedItemSource[] = [];

  if (row.source_id === "huggingnews") {
    const detail = await fetchStoryDetailByUrl(huggingNewsDetailUrl(row.url));
    fetched = { summary: detail.summary };
    sources = detail.sources;
  } else {
    const og = await fetchOgData(row.url);
    fetched = {
      summary: og.description,
      imageUrl: og.imageUrl,
      mediaManifest: og.mediaManifest,
    };
  }

  const plan = planBackfillUpdate(
    {
      summary: row.summary,
      imageUrl: row.image_url,
      mediaManifest: row.media_manifest,
      articleUrl: row.url,
    },
    fetched
  );
  if (!plan) return;
  onPlanned();

  await env.DB.prepare(
    `UPDATE items SET
                       summary = COALESCE(?, summary),
                       image_url = ?,
                       media_manifest = ?
                     WHERE id = ?`
  )
    .bind(
      nn(plan.summary),
      nn(plan.imageUrl),
      serializeMediaManifest(plan.mediaManifest),
      nn(row.id)
    )
    .run();
  await prepareTranslationQaInvalidation(env.DB, row.id).run();

  if (sources.length === 0) return;
  const { results: existingSources } = await env.DB.prepare(
    "SELECT 1 FROM item_sources WHERE item_id = ? LIMIT 1"
  )
    .bind(row.id)
    .all();
  if ((existingSources ?? []).length > 0) return;

  for (const sourceArgs of buildItemSourceBindArgs(row.id, sources)) {
    await env.DB.prepare(INSERT_ITEM_SOURCE_SQL)
      .bind(...sourceArgs)
      .run();
  }
}

/** Backfills existing (pre-enrichment) published items still missing a
 * summary or media. Drains the backlog a few items per hourly run rather
 * than trying to catch up all at once. */
export async function backfillContent(ctx: IngestContext): Promise<number> {
  const { step, env, steps } = ctx;
  const backfilled = await safeStep(
    step,
    "backfill-content",
    0,
    async () => {
      let count = 0;
      try {
        const { results } = await env.DB.prepare(
          buildMissingSummaryQuery(BACKFILL_CONTENT_CAP)
        ).all<ContentBackfillRow>();
        const mediaOnlyRows = await env.DB.prepare(
          buildMissingMediaQuery(BACKFILL_CONTENT_CAP)
        ).all<ContentBackfillRow>();
        const allRows = uniqueById([
          ...(results ?? []),
          ...(mediaOnlyRows.results ?? []),
        ]);

        for (const batch of chunk(allRows, BACKFILL_BATCH_SIZE)) {
          await Promise.all(
            batch.map((row) =>
              backfillContentRow(env, row, () => {
                count++;
              })
            )
          );
        }
      } catch (error) {
        if (isMediaManifestSchemaError(error)) throw error;
        console.error("backfill-content step failed:", error);
      }
      return count;
    },
    undefined,
    true
  );
  recordStep(
    steps,
    "backfill-content",
    backfilled === 0
      ? "0 candidates backfilled"
      : `backfilled ${backfilled} summaries`
  );
  return backfilled;
}
