export interface RankScoreInput {
  importance: number;
  quality: number;
  points: number;
  comments: number;
  publishedAt: number;
  now: number;
  /** Distinct corroborating sources; caps so a pile of mirrors cannot dominate. */
  sourceCount?: number;
}

/** Independent-source corroboration in rank_score. */
export const SOURCE_RANK_WEIGHT = 0.12;
export const SOURCE_RANK_CAP = 8;

/** Multiplier ≥ 1. One outlet = 1.12; eight independent sources ≈ 1.96. */
export function sourceBoost(sourceCount = 0): number {
  return (
    1 + SOURCE_RANK_WEIGHT * Math.min(Math.max(sourceCount, 0), SOURCE_RANK_CAP)
  );
}

export function rankScore({
  importance,
  quality,
  points,
  comments,
  publishedAt,
  now,
  sourceCount = 0,
}: RankScoreInput): number {
  const ageHours = Math.max(0, (now - publishedAt) / (1000 * 60 * 60));
  const qualityFactor = 0.6 + 0.4 * (quality / 10);
  const decay = Math.exp(-ageHours / 36);
  const engagement = 1 + Math.log10(1 + points + 0.5 * comments);
  return (
    importance * qualityFactor * decay * engagement * sourceBoost(sourceCount)
  );
}
