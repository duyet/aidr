import { findSourceSpec } from "./sources/catalog.js";

/** At most this share of a top list may come from one source family. */
export const TOP_LIST_MAX_FAMILY_SHARE = 0.3;

/** Family of a source id: the registry's `family`, else the id itself, so
 *  an operator-added source is its own family. */
export function sourceFamily(sourceId: string): string {
  return findSourceSpec(sourceId)?.family ?? sourceId;
}

/** Per-family cap for a list of `limit` rows (10 → 3, 16 → 5, 8 → 3). */
export function familyCapFor(
  limit: number,
  share = TOP_LIST_MAX_FAMILY_SHARE
): number {
  return Math.max(1, Math.ceil(limit * share));
}

/**
 * Pick `limit` rows from rank-ordered `candidates` so no source family holds
 * more than `maxPerFamily` of them. `initialCounts` seeds families already
 * used elsewhere (e.g. today's trending posts). When the cap leaves the list
 * short, the best skipped rows backfill its tail, so a list never shrinks
 * just because one family dominates the window. Capped picks keep candidate
 * order and come first, so a caller taking the head gets a capped pick.
 */
export function pickDiverse<T extends { source_id: string }>(
  candidates: readonly T[],
  opts: {
    limit: number;
    maxPerFamily?: number;
    initialCounts?: ReadonlyMap<string, number>;
  }
): T[] {
  const { limit } = opts;
  const maxPerFamily = opts.maxPerFamily ?? familyCapFor(limit);
  const counts = new Map(opts.initialCounts ?? []);
  const picked: T[] = [];
  const skipped: T[] = [];
  for (const row of candidates) {
    if (picked.length >= limit) break;
    const family = sourceFamily(row.source_id);
    const used = counts.get(family) ?? 0;
    if (used >= maxPerFamily) {
      skipped.push(row);
      continue;
    }
    counts.set(family, used + 1);
    picked.push(row);
  }
  return [...picked, ...skipped.slice(0, limit - picked.length)];
}

/** Sum per-source counts into per-family counts (for `initialCounts`). */
export function familyCounts(
  rows: readonly { source_id: string; n: number }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { source_id, n } of rows) {
    const family = sourceFamily(source_id);
    counts.set(family, (counts.get(family) ?? 0) + n);
  }
  return counts;
}
