import { chunk } from "../chunk.js";
import { isOfficialRewrite } from "../dedupe.js";
import { sha256Hex } from "../hash.js";
import { parseMediaManifest } from "../media.js";
import { recordStep } from "../run-stats.js";
import { officialSourceFor } from "../sources/catalog.js";
import { toEpochSeconds } from "../time.js";
import { safeStep } from "../workflow-step.js";
import {
  type IngestContext,
  type NewRow,
  RELEVANCE_THRESHOLD,
  type SourceRow,
} from "./context.js";
import type { FetchedSource } from "./fetch.js";
import { headlineOf } from "./merge.js";

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

function isOfficialRow(row: NewRow): boolean {
  return officialSourceFor(row.source.id, row.item.url) !== undefined;
}

/** The later row replaces the earlier one when it should be the one stored. */
function preferLaterRow(row: NewRow, earlier: NewRow): boolean {
  const rowOfficial = isOfficialRow(row);
  const earlierOfficial = isOfficialRow(earlier);
  if (rowOfficial !== earlierOfficial) return rowOfficial;
  const points = row.item.points ?? 0;
  const earlierPoints = earlier.item.points ?? 0;
  if (points !== earlierPoints) return points > earlierPoints;
  return (row.item.comments ?? 0) > (earlier.item.comments ?? 0);
}

/** One row per item id. Two feeds can emit the same URL in one run, and
 * both would upsert one primary key. An official source wins. When neither
 * or both are official, the higher `points` wins, then `comments`, then
 * the earlier row. */
export function collapseSameUrl(rows: readonly NewRow[]): NewRow[] {
  const kept = new Map<string, NewRow>();
  const order: string[] = [];
  for (const row of rows) {
    const earlier = kept.get(row.id);
    if (earlier === undefined) {
      kept.set(row.id, row);
      order.push(row.id);
      continue;
    }
    if (preferLaterRow(row, earlier)) kept.set(row.id, row);
  }
  const collapsed: NewRow[] = [];
  for (const id of order) {
    const row = kept.get(id);
    if (row) collapsed.push(row);
  }
  return collapsed;
}

/** A merged row plus the published canonical it was merged into. */
export interface MergedOfficialRow extends PendingNewRow {
  llm_relevance: number | null;
  canonical_source_id: string;
  canonical_url: string;
  canonical_title: string;
  canonical_published_at: number;
}

/**
 * Which already-stored official posts to run through the pipeline again: a
 * post that was merged under an aggregator rewrite (it arrived first through
 * HN or a submission, before official sources could take a story over) and
 * is provably the original of that rewrite (`isOfficialRewrite`). Re-run as
 * a new row, the merge step makes it the canonical and demotes the rewrite.
 * A post below the relevance bar stays merged, and once it is canonical it
 * no longer matches, so this never loops.
 */
export function officialReadmissions(
  rows: readonly MergedOfficialRow[]
): MergedOfficialRow[] {
  return rows.filter(
    (row) =>
      (row.llm_relevance ?? 1) >= RELEVANCE_THRESHOLD &&
      officialSourceFor(row.canonical_source_id, row.canonical_url) ===
        undefined &&
      isOfficialRewrite(
        headlineOf(row.source_id, row.url, row.title, row.published_at),
        headlineOf(
          row.canonical_source_id,
          row.canonical_url,
          row.canonical_title,
          row.canonical_published_at
        )
      )
  );
}

/** Fetched official URLs whose stored row is merged under a rewrite, as
 * new rows (their stored copy, so the plan matches what D1 holds). */
async function readmitOfficialRows(
  db: D1Database,
  known: readonly NewRow[],
  sources: readonly SourceRow[]
): Promise<NewRow[]> {
  const official = known.filter((c) =>
    officialSourceFor(c.source.id, c.item.url)
  );
  const out: NewRow[] = [];
  for (const part of chunk(official, DEDUPE_IN_CHUNK)) {
    const placeholders = part.map(() => "?").join(",");
    const { results } = await db
      .prepare(
        `SELECT i.id, i.source_id, i.external_id, i.url, i.title, i.summary,
                i.published_at, i.points, i.comments, i.image_url,
                i.source_lang, i.media_manifest, i.llm_relevance,
                c.source_id AS canonical_source_id, c.url AS canonical_url,
                c.title AS canonical_title,
                c.published_at AS canonical_published_at
         FROM items i JOIN items c ON c.id = i.duplicate_of
         WHERE i.id IN (${placeholders}) AND i.status = 'merged'
           AND c.status = 'published'`
      )
      .bind(...part.map((c) => c.id))
      .all<MergedOfficialRow>();
    for (const row of officialReadmissions(results ?? [])) {
      out.push(pendingRowToNewRow(row, sources));
    }
  }
  return out;
}

export async function dedupeNewRows(
  ctx: IngestContext,
  fetchedBySource: readonly FetchedSource[],
  sources: readonly SourceRow[],
  itemsFetched: number
): Promise<NewRow[]> {
  const { step, env, steps } = ctx;
  const newRows = await safeStep(step, "dedupe", [] as NewRow[], async () => {
    const candidates = collapseSameUrl(await toCandidates(fetchedBySource));

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
    for (const row of await readmitOfficialRows(
      env.DB,
      candidates.filter((c) => existingIds.has(c.id)),
      sources
    )) {
      // The fetched row for this id is the one that just arrived.
      if (rows.some((existing) => existing.id === row.id)) continue;
      rows.push(row);
    }

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
