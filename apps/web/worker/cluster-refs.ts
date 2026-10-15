/**
 * How the cluster model's answers referenced the items the prompt sent.
 * The prompt names a new item by its index and an existing row by an alias
 * (`E1` for the first sent), and `normalizeClusters` drops any reference
 * the request did not send. A mistyped reference is then indistinguishable
 * from "no duplicate". These counts tell the two apart; they hold numbers
 * only, never the model's text (#752). Ingest records them per served
 * model in `stats.clusterRefs`; the unmerge duplicate check returns them
 * with each request.
 */

export interface ClusterRefCounts {
  /** Cluster answers counted. */
  calls: number;
  /** `new` entries answered, and those kept (an index the prompt sent). */
  newAnswered: number;
  newKept: number;
  /** `existing` entries answered, and those kept (an alias the prompt sent). */
  existingAnswered: number;
  existingKept: number;
  /** Dropped `existing` entries that were not strings: a position, a null. */
  existingNotString: number;
  /** Dropped `existing` strings shaped like an alias once trimmed and
   *  uppercased: a slip (`e3`) or one never sent (`E301`). Before the
   *  aliases, a 64-hex id within 2 edits or an 8+ character prefix of one. */
  existingNearMiss: number;
  /** Clusters answered with 2+ members that kept fewer than 2. */
  emptied: number;
}

export const EMPTY_CLUSTER_REFS: ClusterRefCounts = {
  calls: 0,
  newAnswered: 0,
  newKept: 0,
  existingAnswered: 0,
  existingKept: 0,
  existingNotString: 0,
  existingNearMiss: 0,
  emptied: 0,
};

const FIELDS = Object.keys(EMPTY_CLUSTER_REFS) as (keyof ClusterRefCounts)[];

export function addClusterRefs(
  a: ClusterRefCounts,
  b: ClusterRefCounts
): ClusterRefCounts {
  const out = { ...a };
  for (const field of FIELDS) out[field] += b[field];
  return out;
}

/** Per served model: the counts of every cluster answer it gave. */
export type ClusterRefTally = Record<string, ClusterRefCounts>;

export function tallyClusterRefs(
  model: string | null,
  refs: ClusterRefCounts | null
): ClusterRefTally {
  return model && refs ? { [model]: refs } : {};
}

const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;

function parseCounts(value: unknown): ClusterRefCounts | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const out = { ...EMPTY_CLUSTER_REFS };
  for (const field of FIELDS) {
    const n = count(record[field]);
    if (n === null) return null;
    out[field] = n;
  }
  return out.calls > 0 ? out : null;
}

/** Reads `stats.clusterRefs` as JSON text, or the value a step returned
 *  (a memoized step from before this field reads as none). A model whose
 *  counts do not all parse is left out. */
export function parseClusterRefs(json: unknown): ClusterRefTally {
  let value = json;
  if (typeof json === "string") {
    try {
      value = JSON.parse(json);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const tally: ClusterRefTally = {};
  for (const [model, counts] of Object.entries(value)) {
    const parsed = parseCounts(counts);
    if (parsed) tally[model] = parsed;
  }
  return tally;
}
