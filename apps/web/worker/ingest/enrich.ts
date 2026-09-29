import { enrichMissingContent } from "../enrich.js";
import type { FetchedItem } from "../sources/types.js";
import { safeStep } from "../workflow-step.js";
import type { IngestContext, NewRow } from "./context.js";

export interface EnrichmentDiff {
  id: string;
  summary?: string;
  imageUrl?: string;
  mediaManifest?: FetchedItem["mediaManifest"];
}

/** Folds the memoized enrichment diff back onto the rows. Only fields the
 * enricher actually produced overwrite; a missing field keeps the fetched
 * value so enrichment can never blank out a summary or image. */
export function applyEnrichment(
  rows: readonly NewRow[],
  enrichment: readonly EnrichmentDiff[]
): NewRow[] {
  const enrichmentById = new Map(enrichment.map((e) => [e.id, e]));
  return rows.map((row) => {
    const e = enrichmentById.get(row.id);
    if (!e) return row;
    return {
      ...row,
      item: {
        ...row.item,
        summary: e.summary ?? row.item.summary,
        imageUrl: e.imageUrl ?? row.item.imageUrl,
        mediaManifest: e.mediaManifest ?? row.item.mediaManifest,
      },
    };
  });
}

/**
 * Fill in summary/media for items lacking either, from the article's own
 * og/description meta tags, BEFORE scoring so the scorer/translator get to
 * see the enriched description. Runs against scratch clones (not `newRows`
 * directly) and returns only the plain diff data: Workflow steps replay by
 * returning their memoized value rather than re-running the callback, so
 * mutating `newRows` in place here wouldn't survive a workflow restart — the
 * fold-back runs as ordinary (replay-safe, deterministic) code outside the
 * step.
 */
export async function enrichNewRows(
  ctx: IngestContext,
  newRows: readonly NewRow[]
): Promise<NewRow[]> {
  const enrichment = await safeStep(
    ctx.step,
    "enrich",
    [] as EnrichmentDiff[],
    async () => {
      if (newRows.length === 0) return [];
      const drafts = newRows.map((row) => ({ ...row.item }));
      await enrichMissingContent(drafts);
      return newRows.map((row, i) => ({
        id: row.id,
        summary: drafts[i].summary,
        imageUrl: drafts[i].imageUrl,
        mediaManifest: drafts[i].mediaManifest,
      }));
    }
  );
  return applyEnrichment(newRows, enrichment);
}
