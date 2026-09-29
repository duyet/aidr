import { WORKFLOW_RUN_STARTED_AT_ORDER_SQL } from "../../worker/workflow-run.js";
import type { DbReader } from "./db";
import {
  hasFailedStep,
  isLatestRunSummary,
  type LatestRunSummary,
} from "./run-health";

/**
 * This pilot defines freshness as the newest item-level `fetched_at` value
 * among published rows. It is the timestamp assigned when that item is first
 * persisted; it is not a workflow-completion or "latest successful run" time.
 * The existing feed field uses the same value and shape.
 */
export const NEWEST_PUBLISHED_FETCHED_AT_SQL =
  "SELECT MAX(fetched_at) AS last FROM items WHERE status = 'published'";

/** Newest workflow run, for the footer health dot. One indexed row. */
export const LATEST_RUN_SQL = `SELECT id, started_at, finished_at, error, stats FROM workflow_runs ORDER BY ${WORKFLOW_RUN_STARTED_AT_ORDER_SQL} DESC, id DESC LIMIT 1`;

/** Browser cache is 60s; Cloudflare edge cache is 120s. No SWR directive. */
export const FEED_FRESHNESS_CACHE_CONTROL = "public, max-age=60, s-maxage=120";
export const FEED_FRESHNESS_ERROR_CACHE_CONTROL = "no-store";

/** Keep the client from pinning a value beyond the browser response TTL. */
export const FEED_FRESHNESS_CLIENT_TTL_MS = 60_000;

export interface FeedFreshness {
  /** Epoch seconds of the newest published item's item-ingest timestamp. */
  lastFetchedAt: number | null;
  /** Newest workflow run. Absent when the value came from the full feed
   *  (which does not carry it); null when there is no run or it is unreadable. */
  latestRun?: LatestRunSummary | null;
}

export function isFeedFreshness(value: unknown): value is FeedFreshness {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (!Object.hasOwn(value, "lastFetchedAt")) {
    return false;
  }
  const { lastFetchedAt, latestRun } = value as {
    lastFetchedAt?: unknown;
    latestRun?: unknown;
  };
  if (
    latestRun !== undefined &&
    latestRun !== null &&
    !isLatestRunSummary(latestRun)
  ) {
    return false;
  }
  return (
    lastFetchedAt === null ||
    (typeof lastFetchedAt === "number" &&
      Number.isInteger(lastFetchedAt) &&
      lastFetchedAt >= 0)
  );
}

/** Legacy workflow_runs rows may store timestamps in ms. */
function toSec(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v > 1e12 ? Math.floor(v / 1000) : v;
}

function parseStats(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function toLatestRunSummary(
  row: Record<string, unknown> | null
): LatestRunSummary | null {
  if (!row || typeof row.id !== "string" || !row.id) return null;
  return {
    id: row.id,
    startedAt: toSec(row.started_at),
    finishedAt: toSec(row.finished_at),
    failed: typeof row.error === "string" && row.error.length > 0,
    degraded: hasFailedStep(parseStats(row.stats)),
  };
}

/** Best effort: a missing table or `stats` column must not break freshness. */
async function getLatestRun(db: DbReader): Promise<LatestRunSummary | null> {
  try {
    const row = await db
      .prepare(LATEST_RUN_SQL)
      .first<Record<string, unknown>>();
    return toLatestRunSummary(row ?? null);
  } catch {
    return null;
  }
}

export async function getFeedFreshness(db: DbReader): Promise<FeedFreshness> {
  const [row, latestRun] = await Promise.all([
    db
      .prepare(NEWEST_PUBLISHED_FETCHED_AT_SQL)
      .first<{ last: number | null }>(),
    getLatestRun(db),
  ]);
  const lastFetchedAt = row?.last ?? null;
  return isFeedFreshness({ lastFetchedAt })
    ? { lastFetchedAt, latestRun }
    : { lastFetchedAt: null, latestRun };
}

export function feedFreshnessResponse(freshness: FeedFreshness): Response {
  return Response.json(freshness, {
    headers: { "Cache-Control": FEED_FRESHNESS_CACHE_CONTROL },
  });
}
