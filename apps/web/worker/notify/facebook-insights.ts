import type { Env } from "../types.js";
import {
  facebookConfigured,
  facebookGraphVersion,
  GRAPH_ORIGIN,
} from "./facebook.js";
import { isSubrequestLimitError } from "./types.js";

/**
 * Daily reach and clicks for the Page's own posts, into `post_stats`
 * (migration 0073, #837). One row per post and UTC day, holding the lifetime
 * totals Graph reports that day.
 *
 * This is a read path and stays apart from the post path in `facebook.ts`: it
 * never records a delivery, and no answer here changes a notification row. It
 * reuses `FACEBOOK_PAGE_ACCESS_TOKEN`, which may lack `read_insights`. A
 * permission or token error ends the run and still writes a NULL row per
 * post, so the daily gate holds and Graph is not asked again until tomorrow.
 * A NULL column means "not reported", never zero.
 *
 * `post_media_view` replaced `post_impressions` (deprecated by Meta). A
 * metric Graph rejects as invalid comes back NULL and the other still lands.
 */

export const FACEBOOK_STATS_CHANNEL = "facebook-en";
export const FACEBOOK_STATS_WINDOW_DAYS = 28;
/** Two Graph calls per post, inside the alarm's subrequest budget. */
export const FACEBOOK_STATS_MAX_POSTS = 12;

const IMPRESSIONS_METRIC = "post_media_view";
const CLICKS_METRIC = "post_clicks";

/** Permission or token problems: asking again today cannot help. */
const BLOCKED_CODES = new Set([10, 190, 200]);
/** Meta asked us to slow down. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 80001, 80006]);

export type FacebookStatsEnv = Pick<
  Env,
  | "DB"
  | "FACEBOOK_PAGE_ID"
  | "FACEBOOK_PAGE_ACCESS_TOKEN"
  | "FACEBOOK_GRAPH_VERSION"
>;

export type FacebookStatsResult =
  | { status: "unconfigured"; reason: string }
  | { status: "skipped"; reason: string }
  | { status: "synced"; posts: number }
  | { status: "stopped"; reason: string; posts: number };

interface MetricRead {
  value: number | null;
  stop?: string;
}

async function readMetric(
  fetcher: typeof fetch,
  token: string,
  version: string,
  postId: string,
  metric: string
): Promise<MetricRead> {
  let raw: unknown;
  try {
    const res = await fetcher(
      `${GRAPH_ORIGIN}/${version}/${encodeURIComponent(postId)}/insights?metric=${metric}&period=lifetime`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      }
    );
    raw = await res.json().catch(() => null);
  } catch (error) {
    if (isSubrequestLimitError(error)) {
      return { value: null, stop: "subrequest budget exhausted" };
    }
    return { value: null };
  }
  const body = raw as {
    data?: { values?: { value?: unknown }[] }[];
    error?: { code?: number };
  } | null;
  const code = body?.error?.code;
  if (code !== undefined) {
    if (BLOCKED_CODES.has(code) || RATE_LIMIT_CODES.has(code)) {
      return { value: null, stop: `Graph error ${code}` };
    }
    return { value: null };
  }
  const value = body?.data?.[0]?.values?.[0]?.value;
  return {
    value: typeof value === "number" && Number.isFinite(value) ? value : null,
  };
}

const UPSERT_SQL = `INSERT INTO post_stats (channel, ref, day, impressions, clicks)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(channel, ref, day) DO UPDATE SET
    impressions = excluded.impressions,
    clicks = excluded.clicks`;

export async function syncFacebookPostStats(
  env: FacebookStatsEnv,
  opts: { now?: number; fetcher?: typeof fetch } = {}
): Promise<FacebookStatsResult> {
  const now = opts.now ?? Date.now();
  const day = new Date(now).toISOString().slice(0, 10);

  let token: string;
  let version: string;
  try {
    const configured = facebookConfigured(env as Env);
    if (!configured.pageId || !configured.token) {
      return { status: "unconfigured", reason: "Facebook Page not configured" };
    }
    token = configured.token;
    version = facebookGraphVersion(env as Env);
  } catch (error) {
    return {
      status: "unconfigured",
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const done = await env.DB.prepare(
    "SELECT 1 AS ok FROM post_stats WHERE channel = ?1 AND day = ?2 LIMIT 1"
  )
    .bind(FACEBOOK_STATS_CHANNEL, day)
    .first<{ ok: number }>();
  if (done) return { status: "skipped", reason: "synced today" };

  const since = now - FACEBOOK_STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const posts = await env.DB.prepare(
    `SELECT message_id FROM notifications
     WHERE channel = ?1 AND status = 'sent' AND posted_at >= ?2
       AND message_id IS NOT NULL AND message_id != ''
     ORDER BY posted_at DESC LIMIT ?3`
  )
    .bind(FACEBOOK_STATS_CHANNEL, since, FACEBOOK_STATS_MAX_POSTS)
    .all<{ message_id: string }>();
  const refs = (posts.results ?? []).map((row) => row.message_id);
  if (refs.length === 0) return { status: "skipped", reason: "no posts" };

  const fetcher = opts.fetcher ?? fetch;
  const rows: [string, number | null, number | null][] = [];
  let stop: string | undefined;
  for (const ref of refs) {
    if (stop) {
      rows.push([ref, null, null]);
      continue;
    }
    const impressions = await readMetric(
      fetcher,
      token,
      version,
      ref,
      IMPRESSIONS_METRIC
    );
    stop = impressions.stop;
    const clicks: MetricRead = stop
      ? { value: null }
      : await readMetric(fetcher, token, version, ref, CLICKS_METRIC);
    stop = stop ?? clicks.stop;
    rows.push([ref, impressions.value, clicks.value]);
  }

  await env.DB.batch(
    rows.map(([ref, impressions, clicks]) =>
      env.DB.prepare(UPSERT_SQL).bind(
        FACEBOOK_STATS_CHANNEL,
        ref,
        day,
        impressions,
        clicks
      )
    )
  );

  if (stop) {
    console.warn(`facebook post stats stopped: ${stop}`);
    return { status: "stopped", reason: stop, posts: refs.length };
  }
  return { status: "synced", posts: refs.length };
}
