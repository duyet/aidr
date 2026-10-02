/** Epoch seconds. Workflow rows have been stored in both seconds and ms. */
export function toEpochSeconds(value: number): number {
  return value > 1_000_000_000_000 ? Math.floor(value / 1000) : value;
}

/** Inclusive window of item `fetched_at` values that belong to one run. */
export function runItemWindow(
  startedAt: number | null,
  finishedAt: number | null,
  nowSec: number
): { from: number; to: number } | null {
  if (startedAt == null || !Number.isFinite(startedAt)) return null;
  const from = toEpochSeconds(startedAt);
  // An open run stores finished_at equal to started_at until close-run.
  const finished = finishedAt == null ? null : toEpochSeconds(finishedAt);
  const end = finished == null || finished === from ? nowSec : finished;
  if (!Number.isFinite(from) || !Number.isFinite(end)) return null;
  return { from, to: Math.max(from, end) };
}
