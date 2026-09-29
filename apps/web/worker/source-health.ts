/**
 * Per-source run health: the observability half of #230.
 *
 * Before this, a source that quietly stopped producing (a moved feed URL, a
 * redesigned template, a host that started 403-ing the Worker) was invisible:
 * `workflow_runs.stats.bySource` only carried a fetch count, the feed just
 * got thinner, and nothing said which source thinned it. This module is the
 * structured, redacted, per-source outcome the workflow writes and the
 * `/api/system/sources` + `/data` surfaces read.
 *
 * Three things are tracked, deliberately and no more:
 *
 * 1. **Counts** — `fetched` / `scored` / `accepted` / `rejected` / `merged`,
 *    so an operator can answer "is this source earning its slot?" without
 *    reading logs. `accepted` is deliberately *not* `fetched`: a source that
 *    fetches 200 items a day and has all 200 rejected by the `relevance < 0.4`
 *    hide rule is a bad source, and only the accept count shows that.
 * 2. **A skip reason** — a closed enum, never free text, never a URL or a
 *    provider body. `sanitizeRunStats` would redact those anyway; not
 *    producing them is cheaper and keeps the enum meaningful.
 * 3. **The empty-run streak** — the stale detector's input. It is *carried
 *    forward* by the worker (one small D1 read of the previous run's stats)
 *    rather than recomputed by scanning run history, so surfacing staleness
 *    costs no extra read on the request path no matter how long the streak
 *    gets.
 *
 * Nothing here changes ranking, the hide rule, or any prompt. `rank_score` and
 * `relevance < 0.4` are untouched: a source that scores badly here is one an
 * operator can *see* and turn off, not one the formula quietly punishes.
 */
import {
  DEFAULT_STALE_AFTER_RUNS,
  findSourceSpec,
  staleAfterRunsFor,
} from "./sources/catalog.js";

/**
 * Why a source delivered nothing this run. Closed set, ordered from the most
 * mechanical failure to the most "working as designed".
 */
export type SourceSkipReason =
  /** The fetch itself failed: non-2xx, timeout, or a thrown transport error. */
  | "fetch_failed"
  /** 2xx with a feed-shaped content type, but nothing parseable came out. */
  | "parse_failed"
  /** Parsed fine; simply nothing inside the ingest since-window. */
  | "empty"
  /** Delivered items, and every one of them fell below the relevance floor. */
  | "all_rejected_below_relevance"
  /** The row is `enabled = 0`; it was not fetched at all. */
  | "disabled";

export const SOURCE_SKIP_REASONS: readonly SourceSkipReason[] = [
  "fetch_failed",
  "parse_failed",
  "empty",
  "all_rejected_below_relevance",
  "disabled",
];

export interface SourceRunHealth {
  /** Items the adapter returned for this source this run. */
  fetched: number;
  /** Of those, how many were new (not already in `items`) and reached the scorer. */
  scored: number;
  /** New items written with status `published` — i.e. they reached the feed. */
  accepted: number;
  /** New items written with status `rejected` (the `relevance < 0.4` hide rule). */
  rejected: number;
  /** New items that collapsed into another item's canonical via the merge pass. */
  merged: number;
  /** Set only when this run delivered nothing usable. Empty string otherwise. */
  skipReason: SourceSkipReason | "";
  /** Consecutive runs (including this one) with `fetched === 0`. */
  emptyRuns: number;
}

export function emptySourceHealth(): SourceRunHealth {
  return {
    fetched: 0,
    scored: 0,
    accepted: 0,
    rejected: 0,
    merged: 0,
    skipReason: "",
    emptyRuns: 0,
  };
}

/** Coerce whatever is in the JSON column into a usable record. A pre-#230 run
 *  has no `sourceHealth` key at all, and a partially-written row must not
 *  turn into `NaN` in the admin UI. */
export function parseSourceHealth(value: unknown): SourceRunHealth | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  const reason =
    typeof raw.skipReason === "string" &&
    (SOURCE_SKIP_REASONS as readonly string[]).includes(raw.skipReason)
      ? (raw.skipReason as SourceSkipReason)
      : "";
  return {
    fetched: num(raw.fetched),
    scored: num(raw.scored),
    accepted: num(raw.accepted),
    rejected: num(raw.rejected),
    merged: num(raw.merged),
    skipReason: reason,
    emptyRuns: num(raw.emptyRuns),
  };
}

/**
 * A source is stale when it has produced nothing for `staleAfterRuns` runs in
 * a row. A *disabled* source is not stale — it is off, which the dashboard
 * already shows and which is not a failure.
 */
export function isSourceStale(health: SourceRunHealth, id: string): boolean {
  if (health.skipReason === "disabled") return false;
  return health.emptyRuns >= staleAfterRunsFor(id);
}

export interface SourceStaleVerdict {
  stale: boolean;
  emptyRuns: number;
  threshold: number;
}

export function sourceStaleVerdict(
  health: SourceRunHealth,
  id: string
): SourceStaleVerdict {
  return {
    stale: isSourceStale(health, id),
    emptyRuns: health.emptyRuns,
    threshold: staleAfterRunsFor(id),
  };
}

/**
 * Advance the streak. A run that fetched anything resets it to 0; a run that
 * fetched nothing increments it. The previous value is read from the prior
 * run's `stats` by the workflow (see `carrySourceEmptyRuns`).
 */
export function nextEmptyRuns(previous: number, fetched: number): number {
  if (fetched > 0) return 0;
  return Math.max(0, Math.floor(previous)) + 1;
}

/**
 * Pick the skip reason for a run that delivered nothing, from the evidence
 * the run actually has — no guessing, and never a raw error string.
 *
 * `failure` is the adapter's typed `SourceFetchError.reason`, which is how
 * "the host 403'd" (`fetch_failed`) stays distinguishable from "the host
 * returned 200 but it was an HTML error page" (`parse_failed`). A returned
 * `[]` with no `failure` means the feed parsed and was simply quiet, i.e.
 * `empty`. `rejected >= newItems > 0` means the source did its job and the
 * hide rule rejected all of it, which is the case that says "this source is
 * too noisy for this product" rather than "this source is broken".
 */
export function resolveSkipReason(input: {
  failure?: "fetch_failed" | "parse_failed";
  fetched: number;
  newItems: number;
  rejected: number;
}): SourceSkipReason | "" {
  if (input.fetched > 0) {
    return input.newItems > 0 && input.rejected >= input.newItems
      ? "all_rejected_below_relevance"
      : "";
  }
  if (input.failure) return input.failure;
  return "empty";
}

/**
 * Fold the previous run's streaks into this run's health map.
 *
 * Streaks are *carried*, not recomputed: the workflow reads the previous run's
 * `stats.sourceHealth` (one small single-row SELECT) instead of scanning run
 * history, so the read path that surfaces "stale" costs nothing no matter how
 * long a source has been silent. A run that fetched anything resets its
 * source to 0; a run that fetched nothing increments it. A source that
 * appears for the first time (an operator just added it through
 * `upsert_source`) starts at 0 rather than inheriting a stranger's streak.
 */
export function carrySourceEmptyRuns(
  current: Record<string, SourceRunHealth>,
  previous: Record<string, SourceRunHealth>
): Record<string, SourceRunHealth> {
  const out: Record<string, SourceRunHealth> = {};
  for (const [id, health] of Object.entries(current)) {
    out[id] = {
      ...health,
      emptyRuns: nextEmptyRuns(previous[id]?.emptyRuns ?? 0, health.fetched),
    };
  }
  return out;
}

/** Read the previous run's per-source streaks out of a `workflow_runs.stats`
 *  JSON blob. Tolerates the pre-#230 shape (no `sourceHealth` key) and
 *  malformed JSON, both of which mean "no history", i.e. streaks start at 0. */
export function parsePreviousEmptyRuns(
  statsJson: unknown
): Record<string, number> {
  if (typeof statsJson !== "string" || !statsJson) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(statsJson);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};
  const health = (parsed as Record<string, unknown>).sourceHealth;
  if (!health || typeof health !== "object" || Array.isArray(health)) return {};
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(health as Record<string, unknown>)) {
    const row = parseSourceHealth(value);
    if (row) out[id] = row.emptyRuns;
  }
  return out;
}

/** Human-facing one-liner for the reason, used in the dashboard cell and the
 *  `steps` reason string. Kept here so the Worker and the web read model
 *  cannot word the same enum differently. */
export function describeSkipReason(reason: SourceSkipReason | ""): string {
  switch (reason) {
    case "":
      return "";
    case "fetch_failed":
      return "fetch failed";
    case "parse_failed":
      return "feed unparseable";
    case "empty":
      return "no items in window";
    case "all_rejected_below_relevance":
      return "all rejected below relevance";
    case "disabled":
      return "disabled";
  }
}

export { DEFAULT_STALE_AFTER_RUNS, findSourceSpec, staleAfterRunsFor };
