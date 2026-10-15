/**
 * Relatedness gate on the LLM cluster pass (#733). The model can attach a
 * correctly paired set of new items to an existing story they share
 * nothing with; `normalizeClusters` only checks that the id was in the
 * request. That hides a real story (`status = 'merged'`) and folds its
 * sources, points and media into the wrong canonical.
 *
 * The gate keeps an existing id in an LLM cluster only when one of the
 * cluster's new items shares evidence with it (`backsExisting`). A
 * missed dedupe costs one duplicate card; a wrong merge hides a story, so
 * the gate is tuned to block no correct merge in the #728 hand labels.
 *
 * Each run tallies, per served cluster model, the links it proposed and the
 * links the gate rejected into `stats.clusterGate`. The health check sums
 * 24h of these and alerts the owner once per model per 24h when the
 * rejected share passes `CLUSTER_GATE_ALERT_RATE`.
 */

import {
  type Cluster,
  evidenceTokens,
  isTitleNearDuplicate,
  normalizeTitleForDedupe,
} from "./dedupe.js";
import type { HealthIssue } from "./health.js";
import { officialSourceFor } from "./sources/catalog.js";
import { looksVietnamese } from "./tldr-lang.js";

/** Part of the unmerge check's `CHECK_VERSION`: bumping it makes every
 *  stored verdict read as unchecked. A test pins the gate's decisions on
 *  the #728 hand labels to this number, so a rule change that moves one
 *  fails until it is bumped. */
export const CLUSTER_GATE_VERSION = 1;

/** What the gate reads of one item in a proposed link. */
export interface GateHeadline {
  title: string;
  sourceId: string;
  url: string;
  /** The title in the other language (`translations.title`: Vietnamese for
   *  an English source, English for a Vietnamese one). Published rows have
   *  one; new items are translated after the merge, so theirs is absent. */
  translation?: string | null;
}

/** What the gate reads of a headline, worked out once per headline object:
 *  the unmerge check (#797) judges each live row against ~180 stories, and
 *  `officialSourceFor` alone cost 69 µs a pair. */
interface HeadlineFacts {
  /** Normalized names of the organizations it is the official source of. */
  orgs: string[];
  evidence: Set<string>;
  translationEvidence: Set<string> | null;
}

const factsCache = new WeakMap<GateHeadline, HeadlineFacts>();

function factsOf(item: GateHeadline): HeadlineFacts {
  let facts = factsCache.get(item);
  if (!facts) {
    facts = {
      orgs: (officialSourceFor(item.sourceId, item.url)?.official ?? [])
        .map(normalizeTitleForDedupe)
        .filter((name) => name.length > 0),
      evidence: evidenceTokens(item.title),
      translationEvidence: item.translation
        ? evidenceTokens(item.translation)
        : null,
    };
    factsCache.set(item, facts);
  }
  return facts;
}

/** True when `title` names an organization `item` is the official source
 *  of: "Google DeepMind Debuts…" against a deepmind post, "Cloudflare…"
 *  against an HN link to a Cloudflare post. An official post's headline
 *  often names only the product ("Introducing SynthID Bio"). */
function namesOfficialOrg(title: string, item: GateHeadline): boolean {
  const { orgs } = factsOf(item);
  if (orgs.length === 0) return false;
  const text = ` ${normalizeTitleForDedupe(title)} `;
  return orgs.some((name) => text.includes(` ${name} `));
}

/** One headline naming an organization the other is the official source
 *  of, or the member's title against the target's title or its stored
 *  translation: a near-duplicate (the title pass merges those anyway, so
 *  the gate never rejects a link that lands), or a shared evidence token.
 *  A Vietnamese title's standalone words are names and numbers ("Google",
 *  "Gemini", "722"), so they match an English title too; its syllable
 *  pairs match the translation of an English one. */
function sharesStoryEvidence(
  member: GateHeadline,
  target: GateHeadline
): boolean {
  if (namesOfficialOrg(member.title, target)) return true;
  if (namesOfficialOrg(target.title, member)) return true;
  if (isTitleNearDuplicate(member.title, target.title)) return true;
  const tokens = factsOf(member).evidence;
  const { evidence, translationEvidence } = factsOf(target);
  return [evidence, translationEvidence].some((headline) => {
    if (!headline) return false;
    for (const token of headline) {
      if (tokens.has(token)) return true;
    }
    return false;
  });
}

/**
 * True when `members`, items the model put in one story, back linking it
 * to `target`: one of them shares evidence with it. When some members are
 * in the target's language only those are judged, so a Vietnamese copy in
 * the cluster cannot vouch for an English story its English members share
 * nothing with.
 */
export function backsExisting(
  members: readonly GateHeadline[],
  target: GateHeadline
): boolean {
  const vietnamese = looksVietnamese(target.title);
  const comparable = members.filter(
    (m) => looksVietnamese(m.title) === vietnamese
  );
  const judged = comparable.length > 0 ? comparable : members;
  return judged.some((m) => sharesStoryEvidence(m, target));
}

/** One existing id the gate removed from an LLM cluster. */
export interface ClusterGateRejection {
  existingId: string;
  newIndices: number[];
}

export interface GatedClusters {
  clusters: Cluster[];
  /** Existing ids the model linked to at least one new item. */
  proposed: number;
  rejected: ClusterGateRejection[];
}

/**
 * Drops each existing id the new items of its LLM cluster do not back
 * (`backsExisting`), and keeps the rest of the cluster (the new items' own
 * pairing is not judged). A cluster with no new item is dropped: the merge
 * plan only folds new items, so its one effect would be to make an
 * unrelated existing row the canonical of a later union.
 */
export function gateLlmClusters(
  clusters: readonly Cluster[],
  newItems: ReadonlyMap<number, GateHeadline>,
  existing: ReadonlyMap<string, GateHeadline>
): GatedClusters {
  const out: Cluster[] = [];
  const rejected: ClusterGateRejection[] = [];
  let proposed = 0;
  for (const cluster of clusters) {
    if (cluster.new.length === 0) continue;
    const members = cluster.new.flatMap((i) => newItems.get(i) ?? []);
    const kept: string[] = [];
    for (const id of cluster.existing) {
      proposed++;
      const target = existing.get(id);
      if (target && backsExisting(members, target)) {
        kept.push(id);
      } else {
        rejected.push({ existingId: id, newIndices: [...cluster.new] });
      }
    }
    if (cluster.new.length + kept.length >= 2) {
      out.push({ new: [...cluster.new], existing: kept });
    }
  }
  return { clusters: out, proposed, rejected };
}

export interface ModelClusterGate {
  /** Existing ids this model linked to new items. */
  proposed: number;
  /** Of those, links the gate rejected. */
  rejected: number;
}

/** Served cluster model id -> counts. */
export type ClusterGateTally = Record<string, ModelClusterGate>;

/** Below this many proposed links in 24h a rate is noise. A day carries
 *  15 to 65 links into existing stories (2026-09-28 to 10-14). */
export const CLUSTER_GATE_MIN_PROPOSED = 20;
/** Measured on every merge into an existing story from 2026-09-28 to
 *  10-14 (merges that landed, not links proposed), as rolling 24h windows
 *  every 30 min with 20+ links: Laguna (before #541, links before
 *  `llm_calls` began on 10-07 counted as Laguna) median 6%, p90 25%, max
 *  36%, above 10% in 172 of 494 windows, all from the merges of 09-30 to
 *  10-03; gemma-latest median 0%, max 2.7% (1 of 95 links overall),
 *  never above 5%. See ALGORITHM.md for the series. A model at gemma's 1.1% false-fires 0.12% of 20-link
 *  windows and 0.01% of 45-link ones; one at Laguna's era mean (45 of 432,
 *  10.4%) fires 35% to 51% of them, and one at Laguna's p90 (25%) 91% to
 *  99%. Alerts fire once per model per 24h. Re-measured with the #745
 *  gate over 2026-09-30 to 10-14 (431 links): Laguna windows above 10%
 *  rise from 63 to 120 of 371, Laguna by `llm_calls` (10-07 to 10-10)
 *  max 6.7% -> 9.1%, and the windows from 10-10 14:00 (gemma-latest,
 *  glm-latest) stay at median 0%, max 4.3%, none above 10%. */
export const CLUSTER_GATE_ALERT_RATE = 0.1;

/** Not `llm…`: a cluster model that links unrelated stories is a model
 *  choice in aidr's chain, not a router fault, so the GitHub issue goes to
 *  duyet/aidr. */
export const CLUSTER_GATE_KEY_PREFIX = "cluster-unrelated:";

export function clusterGateKey(model: string): string {
  return `${CLUSTER_GATE_KEY_PREFIX}${model}`;
}

function add(into: ClusterGateTally, model: string, counts: ModelClusterGate) {
  const m = into[model] ?? { proposed: 0, rejected: 0 };
  into[model] = {
    proposed: m.proposed + counts.proposed,
    rejected: m.rejected + counts.rejected,
  };
}

/** This run's tally: empty when the model linked nothing to an existing id. */
export function tallyClusterGate(
  model: string | null,
  gated: Pick<GatedClusters, "proposed" | "rejected">
): ClusterGateTally {
  if (!model || gated.proposed === 0) return {};
  return {
    [model]: { proposed: gated.proposed, rejected: gated.rejected.length },
  };
}

export function mergeClusterGate(
  ...tallies: readonly ClusterGateTally[]
): ClusterGateTally {
  const out: ClusterGateTally = {};
  for (const tally of tallies) {
    for (const [model, counts] of Object.entries(tally))
      add(out, model, counts);
  }
  return out;
}

const count = (v: unknown): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;

/** Reads `stats.clusterGate` as JSON text (`json_extract`), or the value a
 *  step returned. Anything malformed reads as no links. */
export function parseClusterGate(json: unknown): ClusterGateTally {
  let value = json;
  if (typeof json === "string") {
    try {
      value = JSON.parse(json);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const tally: ClusterGateTally = {};
  for (const [model, counts] of Object.entries(value)) {
    if (!counts || typeof counts !== "object") continue;
    const { proposed, rejected } = counts as Record<string, unknown>;
    const p = count(proposed);
    if (p === 0) continue;
    tally[model] = { proposed: p, rejected: Math.min(count(rejected), p) };
  }
  return tally;
}

function pct(m: ModelClusterGate): string {
  return `${Math.round((m.rejected / m.proposed) * 100)}%`;
}

/** "model: rejected/proposed (pct)", busiest model first. */
export function clusterGateLines(tally: ClusterGateTally): string[] {
  return Object.entries(tally)
    .sort((a, b) => b[1].proposed - a[1].proposed)
    .map(([model, m]) => `${model}: ${m.rejected}/${m.proposed} (${pct(m)})`);
}

/**
 * One warning per model over the threshold in the 24h tally, unless that
 * model's key already fired in the same 24h (`alerted`: every alert key the
 * window's runs recorded).
 */
export function evaluateClusterGate(
  tally: ClusterGateTally,
  alerted: ReadonlySet<string>
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  for (const [model, m] of Object.entries(tally)) {
    if (m.proposed < CLUSTER_GATE_MIN_PROPOSED) continue;
    if (m.rejected / m.proposed <= CLUSTER_GATE_ALERT_RATE) continue;
    const key = clusterGateKey(model);
    if (alerted.has(key)) continue;
    issues.push({
      key,
      severity: "warning",
      title: "Cluster model links unrelated stories",
      detail: `${model} linked ${m.rejected} of ${m.proposed} existing stories to new items with no shared evidence in 24h (${pct(m)}, alert above ${CLUSTER_GATE_ALERT_RATE * 100}%); the gate kept them apart`,
      evidence: clusterGateLines(tally),
    });
  }
  return issues;
}
