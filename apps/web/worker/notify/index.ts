import { absoluteSiteUrl } from "../../src/lib/locale-url.js";
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
import { getLocalHourAndDate } from "../subscribe/send.js";
import { AUDIENCE_TIMEZONE } from "../time.js";
import type { Env } from "../types.js";
import { telegramEnNotifier, telegramNotifier } from "./telegram.js";
import type {
  DailyDigest,
  DigestBullet,
  Notifier,
  SendResult,
  StoryPayload,
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

/** Trending bar: rank_score already folds importance × quality ×
 *  freshness × engagement × independent sources, so a high absolute rank
 *  + a high LLM importance means "big story, corroborated, breaking now". */
export const TRENDING_MIN_RANK = 20;
export const TRENDING_MIN_IMPORTANCE = 7;
/** At most this many trending posts per channel per local day. */
export const TRENDING_MAX_PER_DAY = 6;
/** Minimum spacing between any two posts on a channel. */
export const TRENDING_MIN_GAP_SEC = 60 * 60;
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
  | "below_min_rank"
  | "budget_zero"
  | "none_unposted"
  | "send_failed";

export interface NotifyChannelReason {
  digest: DigestSkipReason;
  trending: TrendingSkipReason;
  maxRank: number | null;
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
    return `${channel}: digest ${r.digest}, trending ${r.trending} (max ${max}, budget ${r.budget})`;
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
  candidateCount: number
): Extract<
  TrendingSkipReason,
  "below_min_rank" | "budget_zero" | "none_unposted"
> | null {
  if (budget === 0) return "budget_zero";
  if ((maxRank ?? 0) < TRENDING_MIN_RANK) return "below_min_rank";
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

/** Pure query builder: unposted trending candidates for a channel.
 *  Vietnamese prefers the VI translation (English source only when that
 *  translation is empty). English posts the source title and summary and
 *  never reads the Vietnamese translation. */
export function buildTrendingQuery(
  channel: string,
  nowMs: number,
  lang: Lang = "vi"
): { sql: string; binds: [string, number, number, number] } {
  const copy =
    lang === "en"
      ? `i.title AS title,
                 i.summary AS summary,
                 'en' AS lang`
      : `COALESCE(NULLIF(TRIM(tr.title), ''), i.title) AS title,
                 COALESCE(NULLIF(TRIM(tr.summary), ''), i.summary) AS summary,
                 CASE WHEN NULLIF(TRIM(tr.title), '') IS NOT NULL
                   THEN 'vi' ELSE 'en' END AS lang`;
  const translationJoin =
    lang === "en"
      ? ""
      : "LEFT JOIN translations tr ON tr.item_id = i.id AND tr.lang = 'vi'\n          ";
  return {
    sql: `SELECT i.id, i.url,
                 ${copy},
                 i.image_url, i.media_manifest, i.category,
                 i.points, i.comments, i.rank_score, i.llm_importance
          FROM items i
          LEFT JOIN notifications n ON n.item_id = i.id AND n.channel = ?
            AND (n.status IN ('sent', 'ambiguous') OR n.attempts >= ${NOTIFY_MAX_ATTEMPTS})
          ${translationJoin}WHERE i.status = 'published'
            AND i.published_at >= ?
            AND i.rank_score >= ?
            AND i.llm_importance >= ?
            AND n.item_id IS NULL
          ORDER BY i.rank_score DESC
          LIMIT ${TRENDING_MAX_PER_DAY}`,
    binds: [
      channel,
      Math.floor(nowMs / 1000) - WINDOW_SEC,
      TRENDING_MIN_RANK,
      TRENDING_MIN_IMPORTANCE,
    ],
  };
}

/** Window max rank, no threshold — so a skip can report live maxRank. */
export function buildMaxRankQuery(nowMs: number): {
  sql: string;
  binds: [number];
} {
  return {
    sql: `SELECT MAX(rank_score) AS max_rank FROM items
          WHERE status = 'published' AND published_at >= ?`,
    binds: [Math.floor(nowMs / 1000) - WINDOW_SEC],
  };
}

/** Per-channel per-day budget: how many more trending posts may go out
 *  now, given today's already-sent count and the time since the channel's
 *  last successful post. Pure for testability. */
export function trendingBudget(
  sentToday: number,
  lastPostedAtMs: number | null,
  nowMs: number
): number {
  if (sentToday >= TRENDING_MAX_PER_DAY) return 0;
  if (
    lastPostedAtMs !== null &&
    nowMs - lastPostedAtMs < TRENDING_MIN_GAP_SEC * 1000
  )
    return 0;
  // Respect the gap between our own posts within this run too: send one
  // per run at most, the next hourly run picks up the rest.
  return 1;
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

  const resolved: DigestBullet[] = [];
  for (const bullet of edition.bullets) {
    let url: string | null = null;
    const itemId = primaryItemId(bullet);
    if (itemId) {
      const item = await env.DB.prepare(
        "SELECT id, category FROM items WHERE id = ?"
      )
        .bind(itemId)
        .first<{ id: string; category: string | null }>();
      if (item) {
        url = absoluteSiteUrl(storyPath(item), lang);
      }
    }
    resolved.push({ text: bullet.text, url });
  }
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

  const { sql: maxRankSql, binds: maxRankBinds } = buildMaxRankQuery(now);
  const maxRankRow = await env.DB.prepare(maxRankSql)
    .bind(...maxRankBinds)
    .first<{ max_rank: number | null }>();
  const maxRank = maxRankRow?.max_rank ?? null;

  const digestByLang = new Map<Lang, DailyDigest | null>();

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
      } else {
        let result: SendResult;
        try {
          result = await notifier.sendDigest(env, digest);
        } catch (error) {
          result = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
        if (!result.ok) {
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
    budget = trendingBudget(
      stats?.sent_today ?? 0,
      sent[notifier.id] > 0 ? null : (stats?.last_posted_at ?? null),
      now
    );

    const trendingSkip = classifyTrendingSkip(maxRank, budget, 1);
    if (trendingSkip === "budget_zero" || trendingSkip === "below_min_rank") {
      trendingReason = trendingSkip;
    } else {
      const { sql, binds } = buildTrendingQuery(
        notifier.id,
        now,
        notifier.lang
      );
      const { results } = await env.DB.prepare(sql)
        .bind(...binds)
        .all<StoryRow>();
      const candidates = (results ?? []).map(hydrateStory);
      const afterQuery = classifyTrendingSkip(
        maxRank,
        budget,
        candidates.length
      );
      if (afterQuery) {
        trendingReason = afterQuery;
      } else {
        for (const story of candidates.slice(0, budget)) {
          let result: SendResult;
          try {
            result = await notifier.sendStory(env, story);
          } catch (error) {
            result = {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
          if (!result.ok) {
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
