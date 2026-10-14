import type { UnmergePlan } from "./plan.js";

export interface UnmergeCounts {
  pairs: Record<string, number>;
  restoredPublished: number;
  restoredRejected: number;
  canonicalsChanged: number;
  columnChanges: Record<string, number>;
  sourceRowsMoved: number;
  sourceRowsAmbiguous: number;
  viTranslations: number;
  lossyNotes: number;
}

/** Counts per action for the dry-run summary and the apply response. */
export function countUnmerge(plan: UnmergePlan): UnmergeCounts {
  const counts: UnmergeCounts = {
    pairs: {},
    restoredPublished: 0,
    restoredRejected: 0,
    canonicalsChanged: 0,
    columnChanges: {},
    sourceRowsMoved: 0,
    sourceRowsAmbiguous: 0,
    viTranslations: 0,
    lossyNotes: 0,
  };
  for (const canonical of plan.canonicals) {
    for (const { outcome } of canonical.pairs) {
      const key =
        outcome.action === "skip" || outcome.action === "noop"
          ? `${outcome.action}:${outcome.reason}`
          : outcome.action;
      counts.pairs[key] = (counts.pairs[key] ?? 0) + 1;
      if (outcome.action === "restore") {
        if (outcome.status === "published") counts.restoredPublished++;
        else counts.restoredRejected++;
      }
    }
    const removed = new Set<string>(
      canonical.pairs
        .filter(
          ({ outcome }) =>
            outcome.action === "restore" || outcome.action === "regroup"
        )
        .map(({ pair }) => pair.mergedId)
    );
    if (removed.size === 0) continue;
    counts.canonicalsChanged++;
    for (const row of canonical.rows) {
      for (const { column } of row.changes) {
        const key = `${row.role}.${column}`;
        counts.columnChanges[key] = (counts.columnChanges[key] ?? 0) + 1;
      }
    }
    counts.sourceRowsMoved += canonical.attribution.filter((a) =>
      removed.has(a.owner)
    ).length;
    counts.sourceRowsAmbiguous += canonical.attribution.filter(
      (a) => a.ambiguous
    ).length;
    counts.viTranslations += canonical.translations.length;
    counts.lossyNotes += canonical.lossy.length;
  }
  return counts;
}
