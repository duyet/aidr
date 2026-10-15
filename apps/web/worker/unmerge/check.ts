/**
 * The model same-story check for dangling restores (#797), pure parts. The
 * title rules in `twins.ts` miss reworded headlines and late re-reports, so
 * before a dangling story publishes, ingest's cluster prompt judges it
 * against the published stories within `CHECK_WINDOW_SEC`, and ingest's
 * cluster gate (`gateLlmClusters`) keeps only links its headline backs.
 *
 * The check is its own step: `check-run.ts` calls the model and stores one
 * verdict per story in `unmerge_checks`; the planner reads the stored
 * verdicts (`planDanglingUnmerge`), so a dry run and an apply never call a
 * model and plan the same thing. A kept link holds the story for a human
 * (`needs-decision`): a model match is evidence, not identity.
 */
import {
  backsExisting,
  CLUSTER_GATE_VERSION,
  type GateHeadline,
  gateLlmClusters,
} from "../cluster-gate.js";
import {
  addClusterRefs,
  type ClusterRefCounts,
  EMPTY_CLUSTER_REFS,
} from "../cluster-refs.js";
import {
  type Cluster,
  type ClusterExistingInput,
  type ClusterNewInput,
  clusterPrompt,
  MAX_NEW_ITEMS_IN_CLUSTER_PROMPT,
  type NearMissLink,
} from "../dedupe.js";
import { MERGE_CANDIDATE_LIMIT } from "../ingest/context.js";
import type { StoryRef } from "./twins.js";

/** Live stories a restore candidate is judged against: published within
 * this many seconds of any of its rows. Re-reports reach 141h (#794). */
export const CHECK_WINDOW_SEC = 7 * 86_400;

/** Calls one request may make by default, and at most. A call takes up to
 * the cluster timeout (120s), so a small cap keeps the request short. */
export const CHECK_DEFAULT_CALLS = 3;
export const CHECK_MAX_CALLS = 10;

/** How the cluster prompt names the live side of a check call. */
export const CHECK_EXISTING_WINDOW = "within 7 days of the new items";

/** FNV-1a, 32-bit: Workers' `crypto.subtle` digest is async, and a module
 * constant needs a value at load. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The prompt and gate a stored verdict came from: a hash of the cluster
 * prompt rendered for one sample row on each side, and the gate's version.
 * A verdict of another version reads as no verdict, so a change to either
 * means a re-check with no hand bump (#802). Verdicts stored as the
 * hand-set version 1 predate the existing-row aliases. */
export const CHECK_VERSION = fnv1a(
  `${CLUSTER_GATE_VERSION}\n${clusterPrompt(
    [{ i: 0, title: "new title", url: "https://new.example", source: "s" }],
    [{ id: "existing-id", title: "existing title" }],
    CHECK_EXISTING_WINDOW
  )}`
);

/** One story's row ids, sorted: the key a verdict is stored under. A story
 * whose rows change between runs has no verdict until it is checked again. */
export function storyKey(ids: readonly string[]): string {
  return [...ids].sort().join(",");
}

export type CheckVerdictKind = "clear" | "match";

/** What the planner reads of a stored verdict. */
export interface StoredCheck {
  story: string;
  version: number;
  verdict: CheckVerdictKind;
  /** Published stories the gate kept a model link to. */
  matches: StoryRef[];
}

export const CHECKS_SQL =
  "SELECT story, version, verdict, matches FROM unmerge_checks";

function isStoryRef(value: unknown): value is StoryRef {
  if (!value || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  return (
    typeof ref.id === "string" &&
    typeof ref.source_id === "string" &&
    typeof ref.url === "string" &&
    typeof ref.title === "string" &&
    typeof ref.published_at === "number"
  );
}

/** Stored verdicts by story. A row that does not parse is left out, so its
 * story reads as unchecked and is held. */
export function parseChecks(
  rows: readonly Record<string, unknown>[]
): Map<string, StoredCheck> {
  const checks = new Map<string, StoredCheck>();
  for (const row of rows) {
    const verdict = row.verdict;
    if (verdict !== "clear" && verdict !== "match") continue;
    let matches: unknown;
    try {
      matches = JSON.parse(String(row.matches));
    } catch {
      continue;
    }
    if (!Array.isArray(matches) || !matches.every(isStoryRef)) continue;
    if (verdict === "match" && matches.length === 0) continue;
    checks.set(String(row.story), {
      story: String(row.story),
      version: Number(row.version),
      verdict,
      matches,
    });
  }
  return checks;
}

/** What a stored check says of a story about to publish. A `distinctFrom`
 * decision overrules a match with the stories it names, and only those. */
export type CheckGate =
  | { kind: "clear" }
  | { kind: "unchecked" }
  | { kind: "match"; matches: StoryRef[] };

export function checkGate(
  checks: ReadonlyMap<string, StoredCheck>,
  ids: readonly string[],
  distinctFrom: readonly string[]
): CheckGate {
  const check = checks.get(storyKey(ids));
  if (!check || check.version !== CHECK_VERSION) return { kind: "unchecked" };
  const judged = new Set(distinctFrom);
  const matches = check.matches.filter((m) => !judged.has(m.id));
  return matches.length > 0 ? { kind: "match", matches } : { kind: "clear" };
}

/** A published row a candidate can be judged against, with the title in the
 * other language that the gate also reads (as ingest's `planMerges` does). */
export interface LiveRow extends StoryRef {
  translation: string | null;
}

/** Published rows in `[from, to]` (epoch seconds), oldest first. */
export function checkWindowSql(from: number, to: number): string {
  return `SELECT i.id, i.source_id, i.url, i.title, i.published_at, i.source_lang,
  t.title AS translation
  FROM items i
  LEFT JOIN translations t ON t.item_id = i.id
    AND t.lang = CASE i.source_lang WHEN 'vi' THEN 'en' ELSE 'vi' END
  WHERE i.status = 'published'
    AND i.published_at BETWEEN ${Math.floor(from)} AND ${Math.floor(to)}
  ORDER BY i.published_at, i.id`;
}

export function parseLiveRows(
  rows: readonly Record<string, unknown>[]
): LiveRow[] {
  return rows.map((row) => {
    const sourceLang = (row.source_lang as string | null) ?? null;
    const translation = (row.translation as string | null) ?? null;
    return {
      id: String(row.id),
      source_id: String(row.source_id),
      url: String(row.url),
      title: String(row.title),
      published_at: Number(row.published_at),
      source_lang: sourceLang,
      title_en: sourceLang === "vi" ? translation : null,
      translation,
    };
  });
}

/** A story the plan would publish once a verdict clears it. */
export interface CheckCandidate {
  story: string;
  rows: StoryRef[];
  from: number;
  to: number;
}

export function checkCandidate(rows: readonly StoryRef[]): CheckCandidate {
  const times = rows.map((row) => row.published_at);
  return {
    story: storyKey(rows.map((row) => row.id)),
    rows: [...rows],
    from: Math.min(...times) - CHECK_WINDOW_SEC,
    to: Math.max(...times) + CHECK_WINDOW_SEC,
  };
}

const headline = (row: StoryRef): GateHeadline => ({
  title: row.title,
  sourceId: row.source_id,
  url: row.url,
});

const liveHeadline = (row: LiveRow): GateHeadline => ({
  ...headline(row),
  translation: row.translation,
});

/** One row per distinct title: aggregator twins carry one headline twice. */
function distinctTitles(rows: readonly StoryRef[]): StoryRef[] {
  return [...new Map(rows.map((row) => [row.title, row])).values()];
}

/** A candidate and the live rows it is shown. */
export interface CheckWork {
  candidate: CheckCandidate;
  live: LiveRow[];
}

/**
 * The live rows in a candidate's window that its headlines back
 * (`backsExisting`). The gate drops every other link the model could make,
 * so they are not sent. A candidate with none needs no call: no link it
 * could get would pass the gate.
 */
export function checkWork(
  candidates: readonly CheckCandidate[],
  live: readonly LiveRow[]
): CheckWork[] {
  // One headline object per row, so the gate works each one out once.
  const headlines = live.map((row) => [row, liveHeadline(row)] as const);
  return candidates.map((candidate) => {
    const members = distinctTitles(candidate.rows).map(headline);
    const own = new Set(candidate.rows.map((row) => row.id));
    return {
      candidate,
      live: headlines
        .filter(
          ([row, target]) =>
            !own.has(row.id) &&
            row.published_at >= candidate.from &&
            row.published_at <= candidate.to &&
            backsExisting(members, target)
        )
        .map(([row]) => row),
    };
  });
}

/** Candidates judged together: every call of the batch shows all of them,
 * and each call one chunk of the live rows they back. */
export interface CheckBatch {
  work: CheckWork[];
  chunks: LiveRow[][];
}

export interface CheckLimits {
  newItems: number;
  existing: number;
}

/** Ingest's per-call limits: the new side and the existing side. */
export const CHECK_LIMITS: CheckLimits = {
  newItems: MAX_NEW_ITEMS_IN_CLUSTER_PROMPT,
  existing: MERGE_CANDIDATE_LIMIT,
};

const byTime = (a: LiveRow, b: LiveRow) =>
  a.published_at - b.published_at || a.id.localeCompare(b.id);

function chunked(rows: readonly LiveRow[], size: number): LiveRow[][] {
  const out: LiveRow[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Packs candidates, oldest window first, into batches whose new side and
 * whose live rows each fit one call. A candidate that backs more live rows
 * than one call holds gets a batch of its own over several calls. Work
 * with no live rows needs no call and is left out.
 */
export function planCheckBatches(
  work: readonly CheckWork[],
  limits: CheckLimits = CHECK_LIMITS
): CheckBatch[] {
  const sorted = work
    .filter((w) => w.live.length > 0)
    .sort(
      (a, b) =>
        a.candidate.from - b.candidate.from ||
        a.candidate.story.localeCompare(b.candidate.story)
    );
  const batches: CheckBatch[] = [];
  let current: CheckWork[] = [];
  let live = new Map<string, LiveRow>();
  let newItems = 0;
  const close = () => {
    if (current.length === 0) return;
    batches.push({
      work: current,
      chunks: chunked([...live.values()].sort(byTime), limits.existing),
    });
    current = [];
    live = new Map();
    newItems = 0;
  };
  for (const w of sorted) {
    const titles = distinctTitles(w.candidate.rows).length;
    const union = new Set([...live.keys(), ...w.live.map((row) => row.id)]);
    if (
      current.length > 0 &&
      (newItems + titles > limits.newItems || union.size > limits.existing)
    ) {
      close();
    }
    current.push(w);
    newItems += titles;
    for (const row of w.live) live.set(row.id, row);
    if (live.size > limits.existing) close();
  }
  close();
  return batches;
}

/** The new side every call of a batch shows, and which story each index
 * belongs to. */
export interface BatchPrompt {
  newItems: ClusterNewInput[];
  owner: Map<number, string>;
  calls: ClusterExistingInput[][];
}

export function batchPrompt(batch: CheckBatch): BatchPrompt {
  const newItems: ClusterNewInput[] = [];
  const owner = new Map<number, string>();
  for (const { candidate } of batch.work) {
    for (const row of distinctTitles(candidate.rows)) {
      const i = newItems.length;
      newItems.push({
        i,
        title: row.title,
        url: row.url,
        source: row.source_id,
      });
      owner.set(i, candidate.story);
    }
  }
  return {
    newItems,
    owner,
    calls: batch.chunks.map((chunk) =>
      chunk.map((row) => ({ id: row.id, title: row.title }))
    ),
  };
}

/** A link the model made that the verdict does not keep. A `near-miss` is
 * an answer that is this live row's alias only once trimmed and
 * uppercased (`e3` for `E3`): the model likely meant it. */
export interface DroppedLink {
  id: string;
  title: string;
  reason: "gate" | "outside-window" | "near-miss";
}

/** One story's verdict, as `unmerge_checks` stores it. */
export interface CheckVerdict {
  story: string;
  verdict: CheckVerdictKind;
  matches: StoryRef[];
  dropped: DroppedLink[];
  /** Ids of the live rows the story was judged against. */
  sent: string[];
}

const storyRefOf = ({ translation: _t, ...ref }: LiveRow): StoryRef => ref;

/** The verdict of a candidate no live row backs: nothing to call. */
export function noEvidenceVerdict(work: CheckWork): CheckVerdict {
  return {
    story: work.candidate.story,
    verdict: "clear",
    matches: [],
    dropped: [],
    sent: [],
  };
}

/**
 * Turns the clusters of every call of a batch into one verdict per story.
 * Each model cluster is split per story, so a story is linked only to the
 * live rows its own headlines back (`gateLlmClusters`), and only within its
 * own window. Links between new items alone are not judged. `nearMisses`
 * change no verdict; each is recorded as a dropped link of its stories.
 */
export function judgeBatch(
  batch: CheckBatch,
  prompt: BatchPrompt,
  clusters: readonly Cluster[],
  nearMisses: readonly NearMissLink[] = []
): CheckVerdict[] {
  const perStory: Cluster[] = [];
  for (const cluster of clusters) {
    if (cluster.existing.length === 0) continue;
    const byStory = new Map<string, number[]>();
    for (const i of cluster.new) {
      const story = prompt.owner.get(i);
      if (story === undefined) continue;
      byStory.set(story, [...(byStory.get(story) ?? []), i]);
    }
    for (const indices of byStory.values()) {
      perStory.push({ new: indices, existing: [...cluster.existing] });
    }
  }
  const newHeadlines = new Map<number, GateHeadline>(
    prompt.newItems.map((item) => [
      item.i,
      { title: item.title, sourceId: item.source ?? "", url: item.url ?? "" },
    ])
  );
  const liveById = new Map<string, LiveRow>();
  for (const chunk of batch.chunks) {
    for (const row of chunk) liveById.set(row.id, row);
  }
  const gated = gateLlmClusters(
    perStory,
    newHeadlines,
    new Map([...liveById].map(([id, row]) => [id, liveHeadline(row)]))
  );
  const kept = new Map<string, Set<string>>();
  const dropped = new Map<string, Map<string, DroppedLink>>();
  const drop = (story: string, id: string, reason: DroppedLink["reason"]) => {
    const list = dropped.get(story) ?? new Map<string, DroppedLink>();
    if (!list.has(id)) {
      list.set(id, { id, title: liveById.get(id)?.title ?? "", reason });
    }
    dropped.set(story, list);
  };
  const windowOf = new Map(
    batch.work.map((w) => [w.candidate.story, new Set(w.live.map((r) => r.id))])
  );
  for (const cluster of gated.clusters) {
    const story = prompt.owner.get(cluster.new[0]) as string;
    for (const id of cluster.existing) {
      if (windowOf.get(story)?.has(id)) {
        kept.set(story, (kept.get(story) ?? new Set()).add(id));
      } else {
        drop(story, id, "outside-window");
      }
    }
  }
  for (const { existingId, newIndices } of gated.rejected) {
    drop(prompt.owner.get(newIndices[0]) as string, existingId, "gate");
  }
  for (const miss of nearMisses) {
    for (const i of miss.new) {
      const story = prompt.owner.get(i);
      if (story !== undefined) drop(story, miss.existing, "near-miss");
    }
  }
  return batch.work.map(({ candidate, live }) => {
    const ids = kept.get(candidate.story) ?? new Set<string>();
    const matches = live.filter((row) => ids.has(row.id)).map(storyRefOf);
    return {
      story: candidate.story,
      verdict: matches.length > 0 ? "match" : "clear",
      matches,
      dropped: [...(dropped.get(candidate.story)?.values() ?? [])].filter(
        (link) => !ids.has(link.id)
      ),
      sent: live.map((row) => row.id),
    };
  });
}

/** Why a check request stopped before every waiting story had a verdict. */
export type CheckStop =
  | "call-cap"
  | "time-budget"
  | "rate-limited"
  | "chain-exhausted"
  | "bad-output";

export interface CheckRunResult {
  operationId: string;
  /** Model calls this request made (failed ones too). */
  calls: number;
  /** Verdicts written: decided without a call (no live row shares
   * evidence), clear after a call, and held by a match. */
  stored: { noEvidence: number; clear: number; match: number };
  /** Stories still waiting for a verdict, and the calls they need, as
   * planned at the start of this request. */
  pending: number;
  pendingCalls: number;
  stoppedBy: CheckStop | null;
  /** The sanitized failure that stopped the request. */
  failure?: string;
  /** How the served answers referenced the prompts' items, summed over
   * this request's calls. */
  refs: ClusterRefCounts;
}

/** After a request stopped on a 429, the next waits this long, doubling up
 * to the cap. It starts past the chain's 2-minute skip of a 429'd model. */
export const CHECK_BACKOFF_MS = 150_000;
export const CHECK_BACKOFF_MAX_MS = 15 * 60_000;
/** Consecutive 429 stops before the run gives up. */
export const CHECK_RATE_LIMIT_STOPS = 3;

export interface DriveResult {
  requests: number;
  calls: number;
  stored: CheckRunResult["stored"];
  refs: ClusterRefCounts;
  /** No story waits for a verdict. */
  finished: boolean;
  stoppedBy: CheckStop | "budget" | null;
  failure?: string;
}

/**
 * Repeats check requests until no story waits, `budget` calls are spent, or
 * a request fails for a reason a retry does not fix. After a 429 stop it
 * backs off; after `CHECK_RATE_LIMIT_STOPS` in a row it gives up. Verdicts
 * stored so far stay, so a later run resumes.
 */
export async function driveCheck(options: {
  budget: number;
  perRequest: number;
  request: (maxCalls: number) => Promise<CheckRunResult>;
  sleep: (ms: number) => Promise<void>;
  report: (line: string) => void;
}): Promise<DriveResult> {
  const out: DriveResult = {
    requests: 0,
    calls: 0,
    stored: { noEvidence: 0, clear: 0, match: 0 },
    refs: EMPTY_CLUSTER_REFS,
    finished: false,
    stoppedBy: "budget",
  };
  let backoff = CHECK_BACKOFF_MS;
  let rateLimited = 0;
  while (out.calls < options.budget) {
    const result = await options.request(
      Math.min(options.perRequest, options.budget - out.calls)
    );
    out.requests++;
    out.calls += result.calls;
    out.stored.noEvidence += result.stored.noEvidence;
    out.stored.clear += result.stored.clear;
    out.stored.match += result.stored.match;
    out.refs = addClusterRefs(out.refs, result.refs);
    options.report(
      `check ${result.operationId}: ${result.calls} call(s), stored ${JSON.stringify(result.stored)}, refs ${JSON.stringify(result.refs)}, ${result.pending} stories were waiting (${result.pendingCalls} calls)${result.stoppedBy ? `, stopped by ${result.stoppedBy}` : ""}; ${out.calls}/${options.budget} calls used`
    );
    if (result.pending === 0) {
      return { ...out, finished: true, stoppedBy: null };
    }
    if (
      result.stoppedBy === "chain-exhausted" ||
      result.stoppedBy === "bad-output"
    ) {
      return { ...out, stoppedBy: result.stoppedBy, failure: result.failure };
    }
    if (result.stoppedBy === "rate-limited") {
      rateLimited++;
      if (rateLimited >= CHECK_RATE_LIMIT_STOPS) {
        return { ...out, stoppedBy: "rate-limited", failure: result.failure };
      }
      options.report(`rate-limited: waiting ${backoff / 1000}s`);
      await options.sleep(backoff);
      backoff = Math.min(backoff * 2, CHECK_BACKOFF_MAX_MS);
      continue;
    }
    rateLimited = 0;
    backoff = CHECK_BACKOFF_MS;
    if (result.calls === 0 && result.stoppedBy === "call-cap") {
      return { ...out, stoppedBy: "call-cap" };
    }
  }
  return out;
}
