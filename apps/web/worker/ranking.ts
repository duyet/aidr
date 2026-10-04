import { sourceFamily } from "./source-diversity.js";
import { findSourceSpec } from "./sources/catalog.js";

export interface RankScoreInput {
  importance: number;
  quality: number;
  points: number;
  comments: number;
  publishedAt: number;
  now: number;
  /** Distinct source families in the story's cluster (`rankSignals`). */
  sourceCount?: number;
  /** Net of signed-in reader votes on this item. 0 when nobody has voted. */
  voteNet?: number;
}

/** Independent-source corroboration in rank_score. */
export const SOURCE_RANK_WEIGHT = 0.12;
export const SOURCE_RANK_CAP = 8;

/** Multiplier ≥ 1 for each family beyond the first. One outlet = 1;
 *  three = 1.24; the cap of eight ≈ 1.84. */
export function sourceBoost(sourceCount = 0): number {
  const extra = Math.min(Math.max(sourceCount, 1), SOURCE_RANK_CAP) - 1;
  return 1 + SOURCE_RANK_WEIGHT * extra;
}

/** Log-damped reader engagement. `voteNet` sits beside source points inside
 * the same log, so a handful of votes moves rank without drowning HN
 * points. Zero votes leaves the historical term. A negative signal mirrors
 * the log and floors at 0, so downvotes lower the score and rank_score
 * stays non-negative. */
export function readerEngagement(
  points: number,
  comments: number,
  voteNet = 0
): number {
  const signal = points + voteNet + 0.5 * comments;
  if (!Number.isFinite(signal)) return 1;
  if (signal >= 0) return 1 + Math.log10(1 + signal);
  return Math.max(0, 1 - Math.log10(1 - signal));
}

export function rankScore({
  importance,
  quality,
  points,
  comments,
  publishedAt,
  now,
  sourceCount = 0,
  voteNet = 0,
}: RankScoreInput): number {
  const ageHours = Math.max(0, (now - publishedAt) / (1000 * 60 * 60));
  const qualityFactor = 0.6 + 0.4 * (quality / 10);
  const decay = Math.exp(-ageHours / 36);
  const engagement = readerEngagement(points, comments, voteNet);
  return (
    importance * qualityFactor * decay * engagement * sourceBoost(sourceCount)
  );
}

/** True when a source's points/comments are reader votes and discussion. */
export function hasReaderEngagement(sourceId: string): boolean {
  return findSourceSpec(sourceId)?.engagement === "reader";
}

/** One item of a story's cluster: the canonical or an item merged into it. */
export interface RankMember {
  sourceId: string;
  points: number;
  comments: number;
  /** The item's URL; places a user submission in its outlet's family. */
  url?: string;
}

/** The rank inputs a cluster earns. `sourceCount` is its distinct source
 *  families, so tweets on one aggregator story or a mirror pair count once.
 *  Points/comments are the highest reader engagement in the cluster; an
 *  aggregator's author/tweet counts never count. */
export function rankSignals(
  members: readonly RankMember[]
): Required<Pick<RankScoreInput, "points" | "comments" | "sourceCount">> {
  const families = new Set(members.map((m) => sourceFamily(m.sourceId, m.url)));
  let points = 0;
  let comments = 0;
  for (const m of members) {
    if (!hasReaderEngagement(m.sourceId)) continue;
    points = Math.max(points, m.points ?? 0);
    comments = Math.max(comments, m.comments ?? 0);
  }
  return { points, comments, sourceCount: families.size };
}

/** Net reader votes, one grouped scan. Ranking queries leave `items`
 * unaliased (`VOTE_NET_JOIN_ITEMS`). Feed and story reads alias it as `i`. */
export const VOTE_NET_COLUMN = "COALESCE(vote_sum.vote_net, 0) AS vote_net";
export const VOTE_NET_JOIN_ITEMS = `LEFT JOIN (
    SELECT item_id, SUM(value) AS vote_net
    FROM item_votes GROUP BY item_id
  ) AS vote_sum ON vote_sum.item_id = items.id`;
export const VOTE_NET_JOIN_I = `LEFT JOIN (
    SELECT item_id, SUM(value) AS vote_net
    FROM item_votes GROUP BY item_id
  ) AS vote_sum ON vote_sum.item_id = i.id`;

/** SELECT columns and FROM join for `rowRankSignals`: the item's own
 *  source and engagement plus `[source_id, points, comments]` of every item
 *  merged into it, and the net of `item_votes` on the canonical. Every query
 *  that feeds `rankScore` must read them, or a re-rank loses the cluster's
 *  corroboration or wipes reader votes. Use them as
 *  `SELECT …, ${RANK_SIGNAL_COLUMNS} FROM items ${RANK_SIGNAL_JOIN} WHERE …`
 *  with `items` unaliased. One grouped scan of merged rows, not a subquery
 *  per item (the per-item form read ~1M rows for one 72h re-rank). */
export const RANK_SIGNAL_COLUMNS = `source_id, points, comments, url AS signal_url, COALESCE(merged.members, '[]') AS merged_members, ${VOTE_NET_COLUMN}`;
export const RANK_SIGNAL_JOIN = `LEFT JOIN (
    SELECT duplicate_of AS canonical_id,
           json_group_array(json_array(source_id, points, comments, url)) AS members
    FROM items WHERE status = 'merged' GROUP BY duplicate_of
  ) AS merged ON merged.canonical_id = items.id
  ${VOTE_NET_JOIN_ITEMS}`;

export interface RankSignalRow {
  source_id: string;
  points: number | null;
  comments: number | null;
  /** Optional: rows read before the URL joined the signal columns. */
  signal_url?: string | null;
  merged_members: string | null;
  /** Absent on rows read before reader votes joined the signal columns. */
  vote_net?: number | null;
}

/** `rankSignals` for a row read with RANK_SIGNAL_COLUMNS. */
export function rowRankSignals(row: RankSignalRow) {
  const merged: [string, number | null, number | null, (string | null)?][] =
    JSON.parse(row.merged_members ?? "[]");
  return {
    ...rankSignals([
      {
        sourceId: row.source_id,
        points: row.points ?? 0,
        comments: row.comments ?? 0,
        url: row.signal_url ?? undefined,
      },
      ...merged.map(([sourceId, points, comments, url]) => ({
        sourceId,
        points: points ?? 0,
        comments: comments ?? 0,
        url: url ?? undefined,
      })),
    ]),
    voteNet: row.vote_net ?? 0,
  };
}

/** Published items from a bound epoch-second start, with every `rankScore`
 *  input the hourly re-rank needs. */
export function buildRerankQuery(): string {
  return `SELECT id, published_at, llm_importance, llm_quality,
                 ${RANK_SIGNAL_COLUMNS}
          FROM items ${RANK_SIGNAL_JOIN}
          WHERE published_at >= ? AND status = 'published'`;
}
