import { chunk } from "../chunk.js";
import { sha256Hex } from "../hash.js";
import { parseMediaManifest } from "../media.js";
import { recordStep } from "../run-stats.js";
import { toEpochSeconds } from "../time.js";
import { safeStep } from "../workflow-step.js";
import type { IngestContext, NewRow, SourceRow } from "./context.js";
import type { FetchedSource } from "./fetch.js";

/** Max ids per `SELECT ... WHERE id IN (...)` (D1 bound-parameter limit). */
export const DEDUPE_IN_CHUNK = 50;

/** An `items` row still at `status = 'new'`. */
export interface PendingNewRow {
  id: string;
  source_id: string;
  external_id: string | null;
  url: string;
  title: string;
  summary: string | null;
  published_at: number;
  points: number;
  comments: number;
  image_url: string | null;
  source_lang: "en" | "vi";
  media_manifest: string | null;
}

/** Turns a `status = 'new'` row back into a pipeline candidate. Its source
 * may have been deleted since the row was inserted; a stand-in keeps the row
 * flowing through scoring instead of dropping a user submission. */
export function pendingRowToNewRow(
  row: PendingNewRow,
  sources: readonly SourceRow[]
): NewRow {
  const source = sources.find((s) => s.id === row.source_id) ?? {
    id: row.source_id,
    type: "unknown",
    config: "{}",
    enabled: 1,
  };
  return {
    id: row.id,
    source,
    item: {
      externalId: row.external_id ?? undefined,
      url: row.url,
      title: row.title,
      summary: row.summary ?? undefined,
      publishedAt: row.published_at,
      points: row.points,
      comments: row.comments,
      imageUrl: row.image_url ?? undefined,
      sourceLang: row.source_lang,
      mediaManifest: parseMediaManifest(row.media_manifest, row.image_url),
    },
  };
}

/** Hashes every fetched URL into its item id and normalizes `publishedAt`
 * to epoch seconds, which the rest of the pipeline assumes. */
export async function toCandidates(
  fetchedBySource: readonly FetchedSource[]
): Promise<NewRow[]> {
  const candidates: NewRow[] = [];
  for (const { source, items } of fetchedBySource) {
    const hashed = await Promise.all(
      items.map(async (item) => ({
        id: await sha256Hex(item.url),
        source,
        item: {
          ...item,
          publishedAt: toEpochSeconds(item.publishedAt),
        },
      }))
    );
    candidates.push(...hashed);
  }
  return candidates;
}

export async function dedupeNewRows(
  ctx: IngestContext,
  fetchedBySource: readonly FetchedSource[],
  sources: readonly SourceRow[],
  itemsFetched: number
): Promise<NewRow[]> {
  const { step, env, steps } = ctx;
  const newRows = await safeStep(step, "dedupe", [] as NewRow[], async () => {
    const candidates = await toCandidates(fetchedBySource);

    const existingIds = new Set<string>();
    for (const part of chunk(candidates, DEDUPE_IN_CHUNK)) {
      const placeholders = part.map(() => "?").join(",");
      const { results } = await env.DB.prepare(
        `SELECT id FROM items WHERE id IN (${placeholders})`
      )
        .bind(...part.map((c) => c.id))
        .all<{ id: string }>();
      for (const row of results ?? []) existingIds.add(row.id);
    }

    const rows = candidates.filter((c) => !existingIds.has(c.id));

    // Rows inserted directly with status='new' (e.g. an accepted user
    // submission, or an admin push) never came through a source's
    // fetchItems() this run, so the loop above never sees them. Pull
    // them in here so they go through the same score/merge/translate
    // pipeline as anything freshly fetched.
    const { results: pendingNew } = await env.DB.prepare(
      `SELECT id, source_id, external_id, url, title, summary,
                  published_at, points, comments, image_url, source_lang, media_manifest
           FROM items WHERE status = 'new'`
    ).all<PendingNewRow>();
    for (const row of pendingNew ?? []) {
      rows.push(pendingRowToNewRow(row, sources));
    }

    return rows;
  });
  recordStep(
    steps,
    "dedupe",
    `${newRows.length} new`,
    `${Math.max(itemsFetched - newRows.length, 0)} already in db`
  );
  return newRows;
}
