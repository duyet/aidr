import { looksVietnamese } from "../../src/lib/display-title.js";
import { absoluteSiteUrl } from "../../src/lib/locale-url.js";
import { stripTitleMarker } from "../../src/lib/plain-text.js";
import { storyPath } from "../../src/lib/slug.js";
import type { Lang } from "../../src/lib/types.js";
import { reportDeliveryFailure } from "../bugsink.js";
import { nn } from "../d1-bind.js";
import { loadEdition, primaryItemId } from "../digest/edition.js";
import {
  canonicalizeMediaImageUrl,
  canonicalizeMediaUrl,
  manifestWithoutArticleUrl,
  parseMediaManifest,
  primaryThumbnailUrl,
} from "../media.js";
import { assertMediaManifestSchema } from "../media-schema.js";
import {
  familyCapFor,
  familyCounts,
  pickDiverse,
} from "../source-diversity.js";
import { getLocalHourAndDate } from "../subscribe/send.js";
import { AUDIENCE_TIMEZONE, isActiveHour } from "../time.js";
import type { Env } from "../types.js";
import {
  telegramEnNotifier,
  telegramNotifier,
  telegramPreviewNotifier,
} from "./telegram.js";
import {
  type DailyDigest,
  type DigestBullet,
  isSubrequestLimitError,
  type Notifier,
  type SendResult,
  type StoryPayload,
} from "./types.js";
import { webhookNotifier } from "./webhook.js";

/**
 * Channel-agnostic dispatch, deliberately non-spammy. Two kinds of posts:
 *
 * 1. Daily TL;DR digest — ONE message per local day per channel, that
 *    channel's language edition, each bullet linked to its story.
 * 2. Trending stories — individual posts only when the ranking algo
 *    flags a story as exceptional (rank + importance bar), capped per day
 *    and spaced by a minimum gap.
 *
 * Delivery state lives in the `notifications` table: digest rows keyed
 * `digest:<date>`, story rows keyed by item id. Failed sends retry on
 * later hourly runs up to NOTIFY_MAX_ATTEMPTS. An `ambiguous` send (no usable
 * answer, so the message may be posted) is never retried.
 *
 * Notify runs last in the hourly Workflow, and the subrequest budget is per
 * Workflow instance, so fetch, LLM and D1 work earlier in the run can leave it
 * empty. A send the runtime refuses for that reason (`budgetExhausted`) posted
 * nothing: it stops every later send in this dispatch, costs no attempt, and
 * the next hourly run sends it.
 */

/** Registered delivery channels; add discord/... here. */
export const notifiers: Notifier[] = [
  telegramNotifier,
  telegramEnNotifier,
  webhookNotifier,
];

/** Calls each channel's enabled() so a half-configured deploy (chat id
 *  without token) throws instead of silently skipping sends. */
export function assertNotifyConfig(env: Env): void {
  for (const notifier of notifiers) {
    notifier.enabled(env);
  }
}

/** Audience timezone: the channel is Vietnamese-first. */
export const DIGEST_TIMEZONE = AUDIENCE_TIMEZONE;
/** Digests only go out from this local hour onward — no 3am posts. */
export const DIGEST_LOCAL_HOUR = 8;
/** TL;DR bullets per digest. */
export const DIGEST_MAX_BULLETS = 8;
/** Give up on a send for a channel after this many failed attempts. */
export const NOTIFY_MAX_ATTEMPTS = 3;

/** Trending rank bar, relative to the window: rank_score folds importance ×
 *  quality × freshness × reader engagement × independent outlets, and its
 *  scale moves whenever one of those changes (2026-10-01: the importance
 *  rubric and source-family corroboration together left a fixed 30 with no
 *  qualifier for five days). A story must reach the TRENDING_RANK_PERCENTILE
 *  of the last TRENDING_BAR_WINDOW_SEC of published ranks: at 0.995 that is
 *  the top two or so of ~400 items, which gave 1–4 qualifiers a day on
 *  2026-09-27..10-01 (0.99 gave up to 6). 2026-10-03: the rank scale fell
 *  again (72h max ~3–8), so one post went out on 10-02 with 26 importance-7+
 *  stories; 0.98 (top ~8 of ~400) lets the 3/day cap and 3h gap do the
 *  limiting. */
export const TRENDING_RANK_PERCENTILE = 0.98;
export const TRENDING_BAR_WINDOW_SEC = 72 * 60 * 60;
/** The bar never drops below this, so a dead window cannot post its best
 *  weak story. A fresh importance-7 story from one outlet with no reader
 *  engagement ranks ~5.6 and stays under it. Lowered to 3 on 2026-10-03:
 *  at 6 the floor, not the percentile, set the bar, and the day's whole
 *  rank range sat below it. */
export const TRENDING_RANK_FLOOR = 3;
/** 7, not 8: Jev scores most big stories 7, so at 8 only one story a day
 *  qualified and the channels went silent after the morning digest
 *  (2026-10-01). Rank >= 30 and the daily cap/gap still keep it rare. */
export const TRENDING_MIN_IMPORTANCE = 7;
/** At most this many trending posts per channel per local day. */
export const TRENDING_MAX_PER_DAY = 3;
/** Minimum spacing between any two posts on a channel. */
export const TRENDING_MIN_GAP_SEC = 3 * 60 * 60;
/** Defined in ./types.ts so webhook.ts can use it without an import cycle. */
export { TRENDING_BURST_MIN_IMPORTANCE } from "./types.js";

import { TRENDING_BURST_MIN_IMPORTANCE } from "./types.js";
export const TRENDING_BURST_MAX_PER_DAY = 6;
export const TRENDING_BURST_MIN_GAP_SEC = 60 * 60;
/** One source family may fill at most this many of a day's trending posts
 *  while another family has a qualifying story (`pickDiverse`). */
export const TRENDING_MAX_PER_FAMILY = familyCapFor(TRENDING_MAX_PER_DAY);
/** Ranked qualifiers read so the family cap has other stories to pick. */
const TRENDING_CANDIDATE_LIMIT = 3 * TRENDING_BURST_MAX_PER_DAY;
/** Only consider stories published in the last 24h. */
const WINDOW_SEC = 24 * 60 * 60;

/** The `notifications.item_id` sentinel for a day's digest. */
export function digestKey(localDate: string): string {
  return `digest:${localDate}`;
}

export type DigestSkipReason =
  | "sent"
  | "no_snapshot"
  | "already_sent"
  | "before_hour"
  | "send_failed";

export type TrendingSkipReason =
  | "sent"
  | "outside_hours"
  | "below_min_rank"
  | "budget_zero"
  | "none_unposted"
  | "send_failed";

export interface NotifyChannelReason {
  digest: DigestSkipReason;
  trending: TrendingSkipReason;
  maxRank: number | null;
  /** The relative rank bar this run used (`trendingRankBar`). */
  rankBar: number;
  budget: number;
  localHour: number;
  localDate: string;
  digestError?: string;
}

export interface NotifyRunResult {
  sent: Record<string, number>;
  reasons: Record<string, NotifyChannelReason>;
}

/** One-line plain-text summary for the run's `notify` step reason. The full
 *  structure is kept in `stats.notifyReason`. A JSON dump here goes over the
 *  240-char step-reason cap once two channels report, and the cut JSON
 *  becomes "[json redacted]" on the next sanitize pass. */
export function summarizeNotifyReasons(
  reasons: Record<string, NotifyChannelReason>
): string {
  const parts = Object.entries(reasons).map(([channel, r]) => {
    const max = r.maxRank === null ? "n/a" : r.maxRank.toFixed(2);
    return `${channel}: digest ${r.digest}, trending ${r.trending} (max ${max}, bar ${r.rankBar.toFixed(2)}, budget ${r.budget})`;
  });
  return parts.length > 0 ? parts.join("; ") : "no channels enabled";
}

interface NotificationRow {
  status: string;
  attempts: number;
}

export type StoryRow = Omit<StoryPayload, "media_manifest"> & {
  media_manifest?: string | null;
};

export function hydrateStory(row: StoryRow): StoryPayload {
  const manifest = manifestWithoutArticleUrl(
    parseMediaManifest(row.media_manifest, row.image_url),
    row.url
  );
  const story = { ...row };
  delete story.media_manifest;
  return {
    ...story,
    title: stripTitleMarker(story.title),
    url: canonicalizeMediaUrl(story.url) ?? "",
    image_url: canonicalizeMediaImageUrl(
      primaryThumbnailUrl(manifest, story.image_url, story.url)
    ),
    media_manifest: manifest.assets.length > 0 ? manifest : null,
  };
}

/** Why today's digest will not go out, or null if it should send. */
export function classifyDigestSkip(
  existing: NotificationRow | null,
  localHour: number
): Extract<DigestSkipReason, "before_hour" | "already_sent"> | null {
  if (localHour < DIGEST_LOCAL_HOUR) return "before_hour";
  if (!existing) return null;
  if (existing.status === "failed" && existing.attempts < NOTIFY_MAX_ATTEMPTS) {
    return null;
  }
  return "already_sent";
}

/** Why trending will not post, or null if a candidate may be sent. */
export function classifyTrendingSkip(
  maxRank: number | null,
  budget: number,
  candidateCount: number,
  localHour: number,
  rankBar: number
): Extract<
  TrendingSkipReason,
  "outside_hours" | "below_min_rank" | "budget_zero" | "none_unposted"
> | null {
  // Overnight posts spent the whole daily cap before readers woke up and
  // left the channel silent all day. A story that still ranks is posted
  // once the window opens.
  if (!isActiveHour(localHour)) return "outside_hours";
  if (budget === 0) return "budget_zero";
  if ((maxRank ?? 0) < rankBar) return "below_min_rank";
  if (candidateCount === 0) return "none_unposted";
  return null;
}

/** True when today's digest should go out for this channel: at/after the
 *  local send hour, and not already sent (failed rows retry while under
 *  the attempt cap). */
export function shouldSendDigest(
  existing: NotificationRow | null,
  localHour: number
): boolean {
  if (localHour < DIGEST_LOCAL_HOUR) return false;
  if (!existing) return true;
  return (
    existing.status === "failed" && existing.attempts < NOTIFY_MAX_ATTEMPTS
  );
}

/** Raw candidate copy: the source text plus this channel's translation. */
export interface ChannelCopyRow {
  source_title: string;
  source_summary: string | null;
  tr_title: string | null;
  tr_summary: string | null;
}

/**
 * Copy for a channel in that channel's language only, no fallback: the
 * channel-language translation when it exists, else the source text when the
 * source is already in that language, else null (the story is skipped on
 * this channel). A Vietnamese source (VnExpress) reaches the English channel
 * through its vi→en translation, never as Vietnamese text.
 */
export function channelCopy<T extends ChannelCopyRow>(
  row: T,
  lang: Lang
):
  | (Omit<T, keyof ChannelCopyRow> & {
      title: string;
      summary: string | null;
      lang: Lang;
    })
  | null {
  const { source_title, source_summary, tr_title, tr_summary, ...rest } = row;
  const translated = tr_title?.trim();
  if (translated) {
    return {
      ...rest,
      title: translated,
      summary: tr_summary?.trim() || null,
      lang,
    };
  }
  const sourceLang: Lang = looksVietnamese(source_title) ? "vi" : "en";
  if (sourceLang !== lang) return null;
  return { ...rest, title: source_title, summary: source_summary, lang };
}

/** Pure query builder: unposted trending candidates for a channel, with the
 *  source copy and that channel's translation (see `channelCopy`). */
export function buildTrendingQuery(
  channel: string,
  nowMs: number,
  lang: Lang = "vi",
  minImportance: number = TRENDING_MIN_IMPORTANCE,
  minRank: number = TRENDING_RANK_FLOOR
): { sql: string; binds: [string, number, number, number] } {
  const trLang = lang === "en" ? "en" : "vi";
  const copy = `i.title AS source_title,
                 i.summary AS source_summary,
                 tr.title AS tr_title,
                 tr.summary AS tr_summary`;
  const translationJoin = `LEFT JOIN translations tr ON tr.item_id = i.id AND tr.lang = '${trLang}'\n          `;
  return {
    sql: `SELECT i.id, i.url,
                 ${copy},
                 i.image_url, i.media_manifest, i.category,
                 i.points, i.comments, i.rank_score, i.llm_importance,
                 i.source_id
          FROM items i
          LEFT JOIN notifications n ON n.item_id = i.id AND n.channel = ?
            AND (n.status IN ('sent', 'ambiguous') OR n.attempts >= ${NOTIFY_MAX_ATTEMPTS})
          ${translationJoin}WHERE i.status = 'published'
            AND i.published_at >= ?
            AND i.rank_score >= ?
            AND i.llm_importance >= ?
            AND n.item_id IS NULL
          ORDER BY i.rank_score DESC
          LIMIT ${TRENDING_CANDIDATE_LIMIT}`,
    binds: [
      channel,
      Math.floor(nowMs / 1000) - WINDOW_SEC,
      minRank,
      minImportance,
    ],
  };
}

/** Per-source count of the trending stories a channel already sent today,
 *  so the family cap spans the day and not just one run's single post. */
export function buildTrendingSourcesTodayQuery(
  channel: string,
  dayStartMs: number
): { sql: string; binds: [string, number] } {
  return {
    sql: `SELECT i.source_id, COUNT(*) AS n
          FROM notifications n JOIN items i ON i.id = n.item_id
          WHERE n.channel = ? AND n.status = 'sent'
            AND n.item_id NOT LIKE 'digest:%' AND n.posted_at >= ?
          GROUP BY i.source_id`,
    binds: [channel, dayStartMs],
  };
}

/** Published ranks of the bar window, so one read gives both the relative
 *  bar and the live 24h max a skip reports. ~400 rows. */
export function buildRankWindowQuery(nowMs: number): {
  sql: string;
  binds: [number];
} {
  return {
    sql: `SELECT rank_score, published_at FROM items
          WHERE status = 'published' AND published_at >= ?`,
    binds: [Math.floor(nowMs / 1000) - TRENDING_BAR_WINDOW_SEC],
  };
}

/** Nearest-rank percentile (`p` in 0..1) of `values`; 0 when empty. */
export function rankPercentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** The rank a story needs to trend: the window's TRENDING_RANK_PERCENTILE,
 *  never below TRENDING_RANK_FLOOR. */
export function trendingRankBar(windowRanks: readonly number[]): number {
  return Math.max(
    TRENDING_RANK_FLOOR,
    rankPercentile(windowRanks, TRENDING_RANK_PERCENTILE)
  );
}

/** Per-channel per-day budget: how many more trending posts may go out
 *  now, given today's already-sent count and the time since the channel's
 *  last successful post. Pure for testability. */
export function trendingBudget(
  sentToday: number,
  lastPostedAtMs: number | null,
  nowMs: number
): number {
  // Respect the gap between our own posts within this run too: send one
  // per run at most, the next hourly run picks up the rest.
  return trendingImportanceFloor(sentToday, lastPostedAtMs, nowMs) === null
    ? 0
    : 1;
}

/** The importance a story needs to be this run's trending post, or null
 *  when nothing may go out. The normal cap and gap keep a usual day quiet;
 *  past them only a burst-level story still posts, up to the burst limits. */
export function trendingImportanceFloor(
  sentToday: number,
  lastPostedAtMs: number | null,
  nowMs: number
): number | null {
  const gapMs =
    lastPostedAtMs === null ? Number.POSITIVE_INFINITY : nowMs - lastPostedAtMs;
  if (sentToday < TRENDING_MAX_PER_DAY && gapMs >= TRENDING_MIN_GAP_SEC * 1000)
    return TRENDING_MIN_IMPORTANCE;
  if (
    sentToday < TRENDING_BURST_MAX_PER_DAY &&
    gapMs >= TRENDING_BURST_MIN_GAP_SEC * 1000
  )
    return TRENDING_BURST_MIN_IMPORTANCE;
  return null;
}

/** Epoch ms of local midnight for `nowMs` in `timezone` — the boundary
 *  for "how many trending posts already went out today". */
export function localDayStartMs(nowMs: number, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(nowMs))
      .map((p) => [p.type, p.value])
  );
  const elapsedSec =
    (Number(parts.hour) % 24) * 3600 +
    Number(parts.minute) * 60 +
    Number(parts.second);
  return nowMs - elapsedSec * 1000 - (nowMs % 1000);
}

/** Loads one language of the TL;DR snapshot. Vietnamese uses `bullets_vi`
 *  only; English uses `bullets_en` only. Neither falls back to the other. */
async function loadDigest(
  env: Env,
  date: string,
  lang: Lang
): Promise<DailyDigest | null> {
  const edition = await loadEdition(env, date, lang, DIGEST_MAX_BULLETS);
  if (!edition) return null;

  // One query for every bullet's story: each D1 call is a subrequest out of
  // the same per-instance budget the sends need.
  const ids = [
    ...new Set(
      edition.bullets
        .map((bullet) => primaryItemId(bullet))
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const items = new Map<string, { id: string; category: string | null }>();
  if (ids.length > 0) {
    const { results } = await env.DB.prepare(
      `SELECT id, category FROM items WHERE id IN (${ids.map(() => "?").join(", ")})`
    )
      .bind(...ids)
      .all<{ id: string; category: string | null }>();
    for (const row of results ?? []) items.set(row.id, row);
  }
  const resolved: DigestBullet[] = edition.bullets.map((bullet) => {
    const itemId = primaryItemId(bullet);
    const item = itemId ? items.get(itemId) : undefined;
    return {
      text: bullet.text,
      url: item ? absoluteSiteUrl(storyPath(item), lang) : null,
    };
  });
  return { lang, date: edition.date, bullets: resolved };
}

/**
 * Delivery state is keyed by (channel, item_id) only. `lang` is NOT part of
 * the key: an EN/VI comparison must never create a second row or a second
 * post for the same story. The upsert bumps `attempts` rather than inserting,
 * so a retry updates one row.
 *
 * Status is `sent`, `failed` (the channel rejected it, nothing was posted,
 * retried up to NOTIFY_MAX_ATTEMPTS) or `ambiguous` (no usable answer, the
 * message may be posted). An `ambiguous` row is final like `sent`: the
 * trending query and the digest gate both skip it, so an unknown outcome costs
 * at most a missed post and never a second one. It is not counted as a post.
 */
export async function recordDelivery(
  env: Pick<Env, "DB">,
  channel: string,
  target: string,
  key: string,
  result: SendResult
): Promise<void> {
  if (result.budgetExhausted) {
    // Nothing was sent: keep the row retryable and the attempt count as is.
    await env.DB.prepare(
      `INSERT INTO notifications (channel, item_id, target, status, attempts, message_id, last_error, posted_at)
       VALUES (?, ?, ?, 'failed', 0, NULL, ?, ?)
       ON CONFLICT(channel, item_id) DO UPDATE SET
         last_error = excluded.last_error`
    )
      .bind(nn(channel), nn(key), nn(target), result.error ?? null, Date.now())
      .run();
    return;
  }
  await env.DB.prepare(
    `INSERT INTO notifications (channel, item_id, target, status, attempts, message_id, last_error, posted_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(channel, item_id) DO UPDATE SET
       status = excluded.status,
       attempts = notifications.attempts + 1,
       message_id = excluded.message_id,
       last_error = excluded.last_error,
       posted_at = excluded.posted_at`
  )
    .bind(
      nn(channel),
      nn(key),
      nn(target),
      result.ok ? "sent" : result.ambiguous ? "ambiguous" : "failed",
      result.messageId ?? null,
      result.error ?? null,
      Date.now()
    )
    .run();
}

/** Runs one send; a throw becomes a failed result, never a crash. */
async function attemptSend(
  send: () => Promise<SendResult>
): Promise<SendResult> {
  try {
    return await send();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      ...(isSubrequestLimitError(error) ? { budgetExhausted: true } : {}),
    };
  }
}

/** Reason recorded for sends skipped after the budget ran out. */
export const BUDGET_SPENT_ERROR =
  "skipped: subrequest budget spent earlier in this run";

/** Owner-facing wording: an ambiguous send needs a look at the channel. */
function failureLabel(result: SendResult): string {
  return result.ambiguous
    ? "outcome unknown (may be posted, will not retry)"
    : "failed";
}

/** Best-effort dispatch; per-channel sent counts plus structured skip reasons. */
export async function dispatchStoryNotifications(
  env: Env
): Promise<NotifyRunResult> {
  await assertMediaManifestSchema(env.DB);
  assertNotifyConfig(env);

  const sent: Record<string, number> = {};
  const reasons: Record<string, NotifyChannelReason> = {};
  const now = Date.now();
  const { hour, date } = getLocalHourAndDate(now, DIGEST_TIMEZONE);
  const key = digestKey(date);
  const dayStartMs = localDayStartMs(now, DIGEST_TIMEZONE);

  const rankWindow = buildRankWindowQuery(now);
  const { results: windowRows } = await env.DB.prepare(rankWindow.sql)
    .bind(...rankWindow.binds)
    .all<{ rank_score: number | null; published_at: number }>();
  const windowRanks = (windowRows ?? []).map((row) => row.rank_score ?? 0);
  const rankBar = trendingRankBar(windowRanks);
  const trendingSince = Math.floor(now / 1000) - WINDOW_SEC;
  const recentRanks = (windowRows ?? [])
    .filter((row) => row.published_at >= trendingSince)
    .map((row) => row.rank_score ?? 0);
  const maxRank = recentRanks.length > 0 ? Math.max(...recentRanks) : null;

  const digestByLang = new Map<Lang, DailyDigest | null>();
  // Set once a send is refused for lack of subrequests: every later send in
  // this dispatch would be refused too, and each refusal is not a real try.
  let budgetSpent = false;

  for (const notifier of notifiers) {
    if (!notifier.enabled(env)) continue;
    const target = notifier.target(env);
    sent[notifier.id] = 0;

    let digestReason: DigestSkipReason = "no_snapshot";
    let digestError: string | undefined;
    let trendingReason: TrendingSkipReason = "none_unposted";
    let budget = 0;

    // --- 1. Daily TL;DR digest (once per local day) ---
    const existing = await env.DB.prepare(
      "SELECT status, attempts FROM notifications WHERE channel = ? AND item_id = ?"
    )
      .bind(notifier.id, key)
      .first<NotificationRow>();

    const digestSkip = classifyDigestSkip(existing ?? null, hour);
    if (digestSkip) {
      digestReason = digestSkip;
    } else {
      let digest = digestByLang.get(notifier.lang);
      if (digest === undefined) {
        digest = await loadDigest(env, date, notifier.lang);
        digestByLang.set(notifier.lang, digest);
      }
      if (!digest) {
        digestReason = "no_snapshot";
      } else if (budgetSpent) {
        digestReason = "send_failed";
        digestError = BUDGET_SPENT_ERROR;
      } else {
        const result = await attemptSend(() =>
          notifier.sendDigest(env, digest)
        );
        if (result.budgetExhausted) {
          budgetSpent = true;
          digestReason = "send_failed";
          digestError = result.error;
          console.error(
            `notify(${notifier.id}) digest deferred: ${result.error}`
          );
        } else if (!result.ok) {
          digestReason = "send_failed";
          digestError = result.error;
          console.error(
            `notify(${notifier.id}) digest failed: ${result.error}`
          );
          await reportDeliveryFailure(
            env,
            `telegram ${notifier.id} digest ${failureLabel(result)}: ${result.error ?? "unknown"}`,
            { channel: notifier.id, kind: "digest" }
          );
        } else {
          digestReason = "sent";
        }
        await recordDelivery(env, notifier.id, target, key, result);
        if (result.ok) sent[notifier.id]++;
      }
    }

    // --- 2. Trending stories (algo-detected, rate-limited) ---
    const stats = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN item_id NOT LIKE 'digest:%' AND posted_at >= ? THEN 1 ELSE 0 END) AS sent_today,
         MAX(posted_at) AS last_posted_at
       FROM notifications WHERE channel = ? AND status = 'sent'`
    )
      .bind(dayStartMs, notifier.id)
      .first<{ sent_today: number | null; last_posted_at: number | null }>();

    // A digest sent seconds ago shouldn't block a genuine trending post
    // forever, but the gap keeps this run from double-posting: budget is
    // computed before this run's digest is counted.
    const importanceFloor = trendingImportanceFloor(
      stats?.sent_today ?? 0,
      sent[notifier.id] > 0 ? null : (stats?.last_posted_at ?? null),
      now
    );
    budget = importanceFloor === null ? 0 : 1;

    const trendingSkip = classifyTrendingSkip(
      maxRank,
      budget,
      1,
      hour,
      rankBar
    );
    if (budgetSpent && trendingSkip === null) {
      trendingReason = "send_failed";
    } else if (
      trendingSkip === "outside_hours" ||
      trendingSkip === "budget_zero" ||
      trendingSkip === "below_min_rank"
    ) {
      trendingReason = trendingSkip;
    } else {
      const { sql, binds } = buildTrendingQuery(
        notifier.id,
        now,
        notifier.lang,
        importanceFloor ?? TRENDING_MIN_IMPORTANCE,
        rankBar
      );
      const { results } = await env.DB.prepare(sql)
        .bind(...binds)
        .all<
          Omit<StoryRow, "title" | "summary" | "lang"> &
            ChannelCopyRow & {
              source_id: string;
            }
        >();
      const today = buildTrendingSourcesTodayQuery(notifier.id, dayStartMs);
      const { results: sentToday } = await env.DB.prepare(today.sql)
        .bind(...today.binds)
        .all<{ source_id: string; n: number }>();
      const candidates = pickDiverse(
        (results ?? [])
          .map((row) => channelCopy(row, notifier.lang))
          .filter((row) => row !== null),
        {
          limit: TRENDING_MAX_PER_DAY,
          maxPerFamily: TRENDING_MAX_PER_FAMILY,
          initialCounts: familyCounts(sentToday ?? []),
        }
      ).map(({ source_id: _sourceId, ...row }) => hydrateStory(row));
      const afterQuery = classifyTrendingSkip(
        maxRank,
        budget,
        candidates.length,
        hour,
        rankBar
      );
      if (afterQuery) {
        trendingReason = afterQuery;
      } else {
        for (const story of candidates.slice(0, budget)) {
          if (budgetSpent) {
            trendingReason = "send_failed";
            break;
          }
          const result = await attemptSend(() =>
            notifier.sendStory(env, story)
          );
          if (result.budgetExhausted) {
            budgetSpent = true;
            trendingReason = "send_failed";
            console.error(
              `notify(${notifier.id}) trending deferred for ${story.id}: ${result.error}`
            );
          } else if (!result.ok) {
            trendingReason = "send_failed";
            console.error(
              `notify(${notifier.id}) trending failed for ${story.id}: ${result.error}`
            );
            await reportDeliveryFailure(
              env,
              `telegram ${notifier.id} trending ${failureLabel(result)}: ${result.error ?? "unknown"}`,
              { channel: notifier.id, kind: "trending" }
            );
          } else {
            trendingReason = "sent";
          }
          await recordDelivery(env, notifier.id, target, story.id, result);
          if (result.ok) sent[notifier.id]++;
        }
      }
    }

    reasons[notifier.id] = {
      digest: digestReason,
      trending: trendingReason,
      maxRank,
      rankBar,
      budget,
      localHour: hour,
      localDate: date,
      digestError,
    };
  }

  const report: NotifyRunResult = { sent, reasons };
  console.info("notify", report);
  return report;
}

/** Admin preview: today's VI and EN digests to one chat (staging). Nothing
 *  is recorded, so the real 08:00 send is unaffected. */
export async function previewDigest(
  env: Env,
  chatId: string
): Promise<Record<string, string>> {
  const { date } = getLocalHourAndDate(Date.now(), DIGEST_TIMEZONE);
  const out: Record<string, string> = {};
  for (const lang of ["vi", "en"] as const) {
    const digest = await loadDigest(env, date, lang);
    if (!digest) {
      out[lang] = `no ${lang} snapshot for ${date}`;
      continue;
    }
    const result = await telegramPreviewNotifier(lang, chatId).sendDigest(
      env,
      digest
    );
    out[lang] = result.ok
      ? `sent ${result.messageId}`
      : `failed: ${result.error}`;
  }
  return out;
}

/** Admin/manual: send today's digest now, ignoring the 08:00 local gate
 * and overwriting a prior sent/failed row. */
export async function forceSendDigest(
  env: Env
): Promise<{ sent: number; reason: string }> {
  const now = Date.now();
  const { date } = getLocalHourAndDate(now, DIGEST_TIMEZONE);
  const key = digestKey(date);
  let sent = 0;
  let sawSnapshot = false;
  for (const notifier of notifiers) {
    if (!notifier.enabled(env)) {
      return {
        sent: 0,
        reason: `${notifier.id} not configured (missing bot token or chat id)`,
      };
    }
    const digest = await loadDigest(env, date, notifier.lang);
    if (!digest) continue;
    sawSnapshot = true;
    const target = notifier.target(env);
    let result: SendResult;
    try {
      result = await notifier.sendDigest(env, digest);
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    await recordDelivery(env, notifier.id, target, key, result);
    if (result.ok) sent++;
    else return { sent, reason: result.error ?? "send failed" };
  }
  if (!sawSnapshot) {
    return { sent: 0, reason: `no TL;DR snapshot for ${date}` };
  }
  return { sent, reason: sent > 0 ? `sent digest ${date}` : "no channel sent" };
}
