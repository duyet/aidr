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
  /** The scorer's category, parsed by `storyCategory`. Required, and
   *  not nullable, so a caller that drops it fails to type-check instead of
   *  scoring the story as flat. */
  category: StoryCategory;
}

type Category = typeof import("./llm.js")["CATEGORIES"][number];

/** A category the kind table weighs, or "" for an unscored row or a name
 *  the scorer's list does not have. */
export type StoryCategory = Category | "";

/** Multiplier per story kind, keyed by the scorer's category. Model and
 *  tech launches, government action (most breaking news) and agent
 *  incidents (much of the drama) rise; company and money news falls;
 *  everything else is flat. Replay over 14 days to 2026-10-16
 *  (`rank-replay`, `base+K4`, gold set labelled before tuning): gold "rise"
 *  stories held 54.4% of top-10 slots instead of 49.0% and "fall" stories
 *  10.1% instead of 15.1%, with every rise kind at or above its old share;
 *  duplicate slots and median age moved by 0.01 slot and 0.1h. The first
 *  table (`K1`: Regulation 1.05, Agents 1.1) cut breaking stories' share. */
export const STORY_KIND_WEIGHTS: Readonly<Record<Category, number>> = {
  Models: 1.2,
  Regulation: 1.2,
  "Open Source": 1.15,
  Agents: 1.15,
  Research: 1.1,
  Chips: 1.1,
  Tools: 1.1,
  Frameworks: 1.05,
  Products: 1,
  Infra: 1,
  Releases: 1,
  Data: 1,
  Industry: 0.9,
  Funding: 0.85,
};

/** Parses `items.category` (or a score result's) at the row boundary. An
 *  own-key check, so "toString" or "constructor" read as unknown. */
export function storyCategory(raw: string | null | undefined): StoryCategory {
  return raw != null && Object.hasOwn(STORY_KIND_WEIGHTS, raw)
    ? (raw as Category)
    : "";
}

export function storyKindWeight(category: StoryCategory): number {
  return category === "" ? 1 : STORY_KIND_WEIGHTS[category];
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

/** Importance is raised to this power, then divided by 10^(power - 1) so a
 * 10 stays a 10. The 7s the scorer clusters on separate from the 9s and 10s:
 * 7 becomes 5.9, 8 becomes 7.2. */
export const IMPORTANCE_EXPONENT = 1.5;

/** After `DECAY_RAMP_START_HOURS` the freshness decay steepens by an extra
 * exp(-(age - 24h)/24h). Past a day a story needs several times a fresh
 * rival's signal to stay ahead of it. */
export const DECAY_TIME_CONSTANT_HOURS = 36;
export const DECAY_RAMP_START_HOURS = 24;
export const DECAY_RAMP_TIME_CONSTANT_HOURS = 24;

/** Ceiling on engagement x sourceBoost. HN points and outlet count each
 * saturate, so a stale story with both cannot hold the top on volume alone. */
export const ENGAGEMENT_BOOST_CAP = 3.25;

/** Engagement ceiling for importance below the threshold: a minor item with
 * a loud thread is still a minor item. */
export const LOW_IMPORTANCE_THRESHOLD = 4;
export const LOW_IMPORTANCE_ENGAGEMENT_CAP = 1.3;

/** Importance at or above this earns a boost while the story is fresh. */
export const BREAKING_IMPORTANCE = 8;
export const BREAKING_BOOST = 0.4;
export const BREAKING_TIME_CONSTANT_HOURS = 3;

/** Each reader vote moves the vote factor by this much, up to
 * `READER_VOTE_CAP` votes: one vote is +20%, five are x2, six or more x2.2.
 * The factor sits outside the engagement log, so a vote moves a story by the
 * same ratio whatever its HN points, and a pile of votes cannot outrank a
 * story whose importance is far higher. A net downvote divides by the same
 * amount, so the score stays positive. */
export const READER_VOTE_GAIN = 0.2;
export const READER_VOTE_CAP = 6;

/** Log-damped source engagement (HN/Lobsters points and comments). */
export function readerEngagement(points: number, comments: number): number {
  const signal = points + 0.5 * comments;
  if (!Number.isFinite(signal) || signal < 0) return 1;
  return 1 + Math.log10(1 + signal);
}

/** Multiplier from signed-in reader votes: 1 with none, above 1 for a net
 * upvote, in (0, 1) for a net downvote, flat beyond `READER_VOTE_CAP`. */
export function voteFactor(voteNet = 0): number {
  if (!Number.isFinite(voteNet)) return 1;
  const steps = READER_VOTE_GAIN * Math.min(READER_VOTE_CAP, Math.abs(voteNet));
  return voteNet >= 0 ? 1 + steps : 1 / (1 + steps);
}

/** LLM scores are 0-10; a stray negative, >10 or NaN must not reach the
 *  power, which is NaN for a negative base and unbounded above 10. */
function clampScore(value: number): number {
  return Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : 0;
}

/** `rankScore` without the fresh-story breaking boost. The weekly edition
 * scores at age zero, where the boost would lift every importance-8 story
 * over the importance-7 ones for no reason the week cares about. */
export function rankScoreWithoutBreaking({
  importance,
  quality,
  points,
  comments,
  publishedAt,
  now,
  sourceCount = 0,
  voteNet = 0,
  category,
}: RankScoreInput): number {
  const ageHours = Math.max(0, (now - publishedAt) / (1000 * 60 * 60));
  importance = clampScore(importance);
  const qualityFactor = 0.6 + 0.4 * (clampScore(quality) / 10);
  let decay = Math.exp(-ageHours / DECAY_TIME_CONSTANT_HOURS);
  if (ageHours > DECAY_RAMP_START_HOURS) {
    decay *= Math.exp(
      -(ageHours - DECAY_RAMP_START_HOURS) / DECAY_RAMP_TIME_CONSTANT_HOURS
    );
  }
  let engagement = readerEngagement(points, comments);
  if (importance < LOW_IMPORTANCE_THRESHOLD) {
    engagement = Math.min(engagement, LOW_IMPORTANCE_ENGAGEMENT_CAP);
  }
  const crowd = Math.min(
    engagement * sourceBoost(sourceCount),
    ENGAGEMENT_BOOST_CAP
  );
  const weight =
    importance ** IMPORTANCE_EXPONENT / 10 ** (IMPORTANCE_EXPONENT - 1);
  const score =
    weight *
    qualityFactor *
    decay *
    crowd *
    voteFactor(voteNet) *
    storyKindWeight(category);
  return Number.isFinite(score) ? score : 0;
}

export function rankScore(input: RankScoreInput): number {
  const ageHours = Math.max(
    0,
    (input.now - input.publishedAt) / (1000 * 60 * 60)
  );
  const breaking =
    clampScore(input.importance) >= BREAKING_IMPORTANCE
      ? 1 + BREAKING_BOOST * Math.exp(-ageHours / BREAKING_TIME_CONSTANT_HOURS)
      : 1;
  const score = rankScoreWithoutBreaking(input) * breaking;
  return Number.isFinite(score) ? score : 0;
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

/** A stored item read with `RANK_SIGNAL_COLUMNS`, plus its own score
 *  columns. `published_at` is epoch seconds. */
export interface RankableRow extends RankSignalRow {
  published_at: number;
  llm_importance?: number | null;
  llm_quality?: number | null;
  category?: string | null;
}

/** `rankScore` for a stored row at `nowMs`. `scores` replaces the row's own
 *  score columns when the caller holds fresher ones (a rescore, a rating). */
export function rankScoreForRow(
  row: RankableRow,
  nowMs: number,
  scores: {
    importance?: number;
    quality?: number;
    category?: string | null;
  } = {}
): number {
  return rankScore({
    importance: scores.importance ?? row.llm_importance ?? 5,
    quality: scores.quality ?? row.llm_quality ?? 5,
    publishedAt: row.published_at * 1000,
    now: nowMs,
    ...rowRankSignals(row),
    category: storyCategory(scores.category ?? row.category),
  });
}

/** Published items from a bound epoch-second start, with every `rankScore`
 *  input the hourly re-rank needs. */
export function buildRerankQuery(): string {
  return `SELECT id, published_at, llm_importance, llm_quality, category,
                 ${RANK_SIGNAL_COLUMNS}
          FROM items ${RANK_SIGNAL_JOIN}
          WHERE published_at >= ? AND status = 'published'`;
}
