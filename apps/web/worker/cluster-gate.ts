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
  isTitleNearDuplicate,
  normalizeTitleForDedupe,
  significantTitleTokens,
} from "./dedupe.js";
import type { HealthIssue } from "./health.js";
import { officialSourceFor } from "./sources/catalog.js";
import { looksVietnamese } from "./tldr-lang.js";

/** What the gate reads of one item in a proposed link. */
export interface GateHeadline {
  title: string;
  sourceId: string;
  url: string;
}

/** Shorter tokens ("ai", "no", "yc", the "ng" left of a Vietnamese word
 *  by `normalizeTitleForDedupe`) are shared by unrelated headlines too. */
const MIN_EVIDENCE_TOKEN_LENGTH = 3;

function evidenceTokens(title: string): Set<string> {
  const out = new Set<string>();
  for (const token of significantTitleTokens(title)) {
    if (token.length >= MIN_EVIDENCE_TOKEN_LENGTH) out.add(token);
  }
  return out;
}

/** True when `title` names an organization `item` is the official source
 *  of: "Google DeepMind Debuts…" against a deepmind post, "Cloudflare…"
 *  against an HN link to a Cloudflare post. An official post's headline
 *  often names only the product ("Introducing SynthID Bio"). */
function namesOfficialOrg(title: string, item: GateHeadline): boolean {
  const orgs = officialSourceFor(item.sourceId, item.url)?.official ?? [];
  const text = ` ${normalizeTitleForDedupe(title)} `;
  return orgs.some((org) => {
    const name = normalizeTitleForDedupe(org);
    return name.length > 0 && text.includes(` ${name} `);
  });
}

/** A near-duplicate title, a shared significant word of 3+ letters, or one
 *  headline naming an organization the other is the official source of. */
function sharesStoryEvidence(a: GateHeadline, b: GateHeadline): boolean {
  if (isTitleNearDuplicate(a.title, b.title)) return true;
  const tokensB = evidenceTokens(b.title);
  for (const token of evidenceTokens(a.title)) {
    if (tokensB.has(token)) return true;
  }
  return namesOfficialOrg(a.title, b) || namesOfficialOrg(b.title, a);
}

/**
 * True when `members`, items the model put in one story, back linking it
 * to `target`. Only members in the target's language are judged: one of
 * them has to share evidence with it. A Vietnamese headline shares no words
 * with an English one even when it is the same story, so when every member
 * is in the other language the link is allowed.
 */
export function backsExisting(
  members: readonly GateHeadline[],
  target: GateHeadline
): boolean {
  const vietnamese = looksVietnamese(target.title);
  const comparable = members.filter(
    (m) => looksVietnamese(m.title) === vietnamese
  );
  if (comparable.length === 0) return members.length > 0;
  return comparable.some((m) => sharesStoryEvidence(m, target));
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
 *  99%. Alerts fire once per model per 24h. */
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
