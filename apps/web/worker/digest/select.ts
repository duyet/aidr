import { familyCapFor, sourceFamily } from "../source-diversity.js";

/** The scorer's 8+ : a frontier launch or a market-moving event. One per
 *  family may take a slot beyond the family cap while it is in contention. */
export const EDITION_TOP_TIER_IMPORTANCE = 8;
/** Below this the scorer called the story incremental or niche. It fills an
 *  edition only when nothing stronger is left in contention. */
export const EDITION_WEAK_IMPORTANCE = 5;
/** Extra slots a family may hold beyond its cap, each for a top-tier story
 *  the cap would cut. At 16 the cap is 5, so one family holds at most 6. */
export const EDITION_TOP_TIER_LIFT = 1;
/** How deep into the rank-ordered pool importance may reorder, as a
 *  multiple of the edition size. Deeper rows lost on rank, not on the cap:
 *  on 2026-10-14 an importance-8.5 row sat at #110 because it was a day old,
 *  and lifting it would have cut a fresh #11. */
export const CONTENTION_DEPTH = 2;

export interface EditionCandidate {
  source_id: string;
  llm_importance: number | null;
}

/** Most picks one family may hold in an edition of `limit`. */
export function editionFamilyCeiling(limit: number): number {
  return familyCapFor(limit) + EDITION_TOP_TIER_LIFT;
}

/**
 * Pick the edition's `limit` stories from rank-ordered `candidates`.
 *
 * `pickDiverse` alone cut by source family only: in the week of 2026-10-09
 * it dropped importance-8 stories ranked in the top 30 (Gemini 4 Argon's
 * safety report at 8.1) while HN rows at importance 4 (a $15M maths grant)
 * made the edition on points. Within the contention depth, every top-tier
 * story holds a slot, which comes off the edition's lowest-ranked other
 * story of any family. One the family cap would cut takes one extra slot
 * for its family, so a lift never costs its family a higher-ranked pick (on
 * 2026-10-15 the lifted Gemini 4 Argon report at #26 must not cost Black
 * Forest Labs' open model at #10). A weak story is the last resort. The
 * result is in rank order.
 */
export function selectEdition<T extends EditionCandidate>(
  candidates: readonly T[],
  opts: { limit: number }
): T[] {
  const { limit } = opts;
  const cap = familyCapFor(limit);
  const ceiling = editionFamilyCeiling(limit);
  const reach = Math.min(candidates.length, limit * CONTENTION_DEPTH);
  const families = candidates.map((row) => sourceFamily(row.source_id));
  const importance = (i: number) => candidates[i].llm_importance ?? 0;
  const topTier = (i: number) => importance(i) >= EDITION_TOP_TIER_IMPORTANCE;

  // Slots held back for the top-tier rows in contention, so a row ranked
  // above them cannot fill the edition first.
  const topTierPerFamily = new Map<string, number>();
  for (let i = 0; i < reach; i++) {
    if (!topTier(i)) continue;
    const n = topTierPerFamily.get(families[i]) ?? 0;
    topTierPerFamily.set(families[i], Math.min(ceiling, n + 1));
  }
  let reserved = 0;
  for (const n of topTierPerFamily.values()) reserved += n;
  let room = limit - reserved;

  const counts = new Map<string, number>();
  const picked = new Set<number>();
  const fill = (end: number, accepts: (i: number, used: number) => boolean) => {
    for (let i = 0; i < end && picked.size < limit; i++) {
      if (picked.has(i)) continue;
      const used = counts.get(families[i]) ?? 0;
      if (!accepts(i, used)) continue;
      counts.set(families[i], used + 1);
      picked.add(i);
    }
  };

  fill(reach, (i, used) => {
    if (topTier(i)) return used < ceiling;
    if (importance(i) < EDITION_WEAK_IMPORTANCE || used >= cap || room <= 0)
      return false;
    room--;
    return true;
  });
  fill(
    reach,
    (i, used) => importance(i) >= EDITION_WEAK_IMPORTANCE && used < cap
  );
  fill(candidates.length, (_, used) => used < cap);
  fill(candidates.length, () => true);
  return [...picked].sort((a, b) => a - b).map((i) => candidates[i]);
}
