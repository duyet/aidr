import { familyCapFor, sourceFamily } from "../source-diversity.js";

/** The scorer's 8+ : a frontier launch or a market-moving event. The
 *  edition never cuts one for the family cap while it is in contention. */
export const EDITION_TOP_TIER_IMPORTANCE = 8;
/** Below this the scorer called the story incremental or niche. It fills an
 *  edition only when nothing stronger is left in the pool. */
export const EDITION_WEAK_IMPORTANCE = 5;
/** How deep into the rank-ordered pool a top-tier story may still claim a
 *  slot, as a multiple of the edition size. Deeper rows lost on rank, not on
 *  the cap: on 2026-10-14 an importance-8.5 row sat at #110 because it was a
 *  day old, and lifting it would have cut a fresh #11. */
export const CONTENTION_DEPTH = 2;

export interface EditionCandidate {
  source_id: string;
  llm_importance: number | null;
}

/** One fill pass over the rank-ordered pool: rows at or above
 *  `minImportance`, within the first `limit * depthScale` rows, while the
 *  row's family holds fewer than `familyCap(softCap)` picks. */
interface FillPass {
  minImportance: number;
  depthScale: number;
  familyCap: (softCap: number) => number;
}

/** Passes run in order; each takes only rows the earlier ones left. */
const FILL_PASSES: readonly FillPass[] = [
  {
    minImportance: EDITION_TOP_TIER_IMPORTANCE,
    depthScale: CONTENTION_DEPTH,
    familyCap: () => Infinity,
  },
  {
    minImportance: EDITION_WEAK_IMPORTANCE,
    depthScale: Infinity,
    familyCap: (softCap) => softCap,
  },
  { minImportance: 0, depthScale: Infinity, familyCap: () => Infinity },
];

/**
 * Pick the edition's `limit` stories from rank-ordered `candidates`.
 *
 * `pickDiverse` alone cut by source family only: in the week of 2026-10-09
 * it dropped importance-8 stories ranked in the top 30 (Gemini 4 Argon's
 * safety report at 8.1) while HN rows at importance 4 (a $15M maths grant)
 * made the edition on points. Importance now decides what the family cap
 * may cut, and a weak story is the last resort. The result is in rank
 * order, so the first bullet is still the top-ranked story.
 */
export function selectEdition<T extends EditionCandidate>(
  candidates: readonly T[],
  opts: { limit: number; maxPerFamily?: number }
): T[] {
  const { limit } = opts;
  const softCap = opts.maxPerFamily ?? familyCapFor(limit);
  const counts = new Map<string, number>();
  const picked = new Set<number>();
  for (const pass of FILL_PASSES) {
    const cap = pass.familyCap(softCap);
    const depth = Math.min(candidates.length, limit * pass.depthScale);
    for (let i = 0; i < depth && picked.size < limit; i++) {
      if (picked.has(i)) continue;
      const row = candidates[i];
      if ((row.llm_importance ?? 0) < pass.minImportance) continue;
      const family = sourceFamily(row.source_id);
      const used = counts.get(family) ?? 0;
      if (used >= cap) continue;
      counts.set(family, used + 1);
      picked.add(i);
    }
  }
  return [...picked].sort((a, b) => a - b).map((i) => candidates[i]);
}
