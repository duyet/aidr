import { MOVED_ACTIONS, type UnmergePlan } from "./plan.js";

export interface UnmergeCounts {
  pairs: Record<string, number>;
  restoredPublished: number;
  restoredRejected: number;
  /** Pairs merged into a story already live instead of published. */
  repointed: number;
  /** Pairs held until the pairs file says `sameAs` or `distinctFrom`. */
  needsDecision: number;
  canonicalsChanged: number;
  columnChanges: Record<string, number>;
  /** Assets taken off canonicals' stored manifests. */
  foreignAssetsRemoved: number;
  sourceRowsMoved: number;
  sourceRowsAmbiguous: number;
  viTranslations: number;
  lossyNotes: number;
  /** Changed canonicals left with no tags. */
  untaggedCanonicals: string[];
}

function assetUrls(manifest: unknown): string[] {
  try {
    const assets = (JSON.parse(String(manifest)) as { assets?: unknown })
      .assets;
    return Array.isArray(assets)
      ? assets.map((asset) => String((asset as { url?: unknown }).url))
      : [];
  } catch {
    return [];
  }
}

/** Counts per action for the dry-run summary and the apply response. */
export function countUnmerge(plan: UnmergePlan): UnmergeCounts {
  const counts: UnmergeCounts = {
    pairs: {},
    restoredPublished: 0,
    restoredRejected: 0,
    repointed: 0,
    needsDecision: 0,
    canonicalsChanged: 0,
    columnChanges: {},
    foreignAssetsRemoved: 0,
    sourceRowsMoved: 0,
    sourceRowsAmbiguous: 0,
    viTranslations: 0,
    lossyNotes: 0,
    untaggedCanonicals: [],
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
      if (outcome.action === "repoint") counts.repointed++;
      if (outcome.action === "skip" && outcome.reason === "needs-decision") {
        counts.needsDecision++;
      }
    }
    const removed = new Set<string | null>(
      canonical.pairs
        .filter(({ outcome }) => MOVED_ACTIONS.has(outcome.action))
        .map(({ pair }) => pair.mergedId)
    );
    if (removed.size === 0) continue;
    for (const row of canonical.rows) {
      for (const { column } of row.changes) {
        const key = `${row.role}.${column}`;
        counts.columnChanges[key] = (counts.columnChanges[key] ?? 0) + 1;
      }
    }
    const canonicalRow = canonical.rows.find((r) => r.role === "canonical");
    // A dangling group (#791) has no canonical row to change.
    if (canonicalRow) counts.canonicalsChanged++;
    const manifest = canonicalRow?.changes.find(
      (c) => c.column === "media_manifest"
    );
    if (manifest) {
      const after = new Set(assetUrls(manifest.after));
      counts.foreignAssetsRemoved += assetUrls(manifest.before).filter(
        (url) => !after.has(url)
      ).length;
    }
    const tags =
      canonicalRow?.changes.find((c) => c.column === "tags")?.after ??
      canonicalRow?.guard.tags;
    if (tags === "[]" || tags === null) {
      counts.untaggedCanonicals.push(canonical.canonicalId);
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
