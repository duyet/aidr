/**
 * How the cluster model's answers referenced the items the prompt sent.
 * The prompt names a new item by its index and an existing row by its full
 * 64-hex id, and `normalizeClusters` drops any reference the request did not
 * send. A mistyped id is then indistinguishable from "no duplicate". These
 * counts tell the two apart; they hold numbers only, never the model's text
 * (#752). Ingest records them per served model in `stats.clusterRefs`; the
 * unmerge duplicate check returns them with each request.
 */

export interface ClusterRefCounts {
  /** Cluster answers counted. */
  calls: number;
  /** `new` entries answered, and those kept (an index the prompt sent). */
  newAnswered: number;
  newKept: number;
  /** `existing` entries answered, and those kept (an id the prompt sent). */
  existingAnswered: number;
  existingKept: number;
  /** Dropped `existing` entries that were not strings: a position, a null. */
  existingNotString: number;
  /** Dropped `existing` strings that `nearMissOf` resolves to a sent id. */
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

/** Shorter tokens are too likely to prefix an id by chance. */
const NEAR_MISS_MIN_LENGTH = 8;
/** Two 64-hex ids differ in about 60 places, so 2 edits never cross ids. */
const NEAR_MISS_MAX_EDITS = 2;

/** True when `a` and `b` are at most `max` edits apart. Banded: only cells
 *  within `max` of the diagonal can stay under the bound. */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const far = max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) =>
    j <= max ? j : far
  );
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(far);
    if (i <= max) row[0] = i;
    let best = row[0];
    const from = Math.max(1, i - max);
    const to = Math.min(b.length, i + max);
    for (let j = from; j <= to; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j - 1] + cost, prev[j] + 1, row[j - 1] + 1, far);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

/**
 * The sent id an unknown `existing` token most likely meant: equal after
 * trimming and lowercasing, a prefix of 8+ characters, or at most 2 edits
 * away. Null when none is that close.
 */
export function nearMissOf(
  token: string,
  sent: Iterable<string>
): string | null {
  const t = token.trim().toLowerCase();
  if (t.length < NEAR_MISS_MIN_LENGTH) return null;
  for (const id of sent) {
    const k = id.toLowerCase();
    if (k.startsWith(t) || withinEdits(t, k, NEAR_MISS_MAX_EDITS)) return id;
  }
  return null;
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
