import { absoluteSiteUrl } from "../../src/lib/locale-url.js";
import { stripTitleMarker } from "../../src/lib/plain-text.js";
import { storyPath } from "../../src/lib/slug.js";
import type { Lang } from "../../src/lib/types.js";
import { reportDeliveryFailure } from "../bugsink.js";
import { nn } from "../d1-bind.js";
import { loadEdition, primaryItemId } from "../digest/edition.js";
import { enSummarySql } from "../en-summary.js";
import {
  canonicalizeMediaImageUrl,
  canonicalizeMediaUrl,
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
import { stripEmbeddedChrome } from "../translation-terms.js";
import type { Env } from "../types.js";
import { loadDayCard } from "./day-card.js";
import { facebookEnNotifier } from "./facebook.js";
import {
  countSuppression,
  dedupReason,
  eventKey,
  postability,
  type SuppressionCounts,
} from "./post-quality.js";
import {
  digestItemIds,
  loadPostedEvents,
  recordDigestItems,
} from "./posted-events.js";
import {
  editDigestReplyMarkup,
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
 *    channel's language edition, each bullet linked to its story. A channel
 *    with `postsDigestHighlight` (Telegram) then posts the digest's top
 *    postable story on its own, once, and only after a digest that surely
 *    posted.
 * 2. Trending stories — individual posts only when the ranking algo
 *    flags a story as exceptional (rank + importance bar), capped per day
 *    and spaced by a minimum gap.
 *
 * Delivery state lives in the `notifications` table: digest rows keyed
 * `digest:<date>`, the highlight `digest:<date>:top`, story rows keyed by
 * item id. Failed sends retry on
 * later hourly runs up to NOTIFY_MAX_ATTEMPTS. An `ambiguous` send (no usable
 * answer, so the message may be posted) is never retried.
 *
 * Every send is claimed before it goes out (`claimDelivery`): one atomic
 * upsert moves the row to `sending`, and only the run whose write changed a
 * row sends. A retried Workflow step or a forced run overlapping a scheduled
 * one finds the claim and posts nothing (#531).
 *
 * Notify runs last in the hourly Workflow, and the subrequest budget is per
 * Workflow instance, so fetch, LLM and D1 work earlier in the run can leave it
 * empty. A send the runtime refuses for that reason (`budgetExhausted`) posted
 * nothing: it stops every later send in this dispatch, costs no attempt, and
 * the next hourly run sends it.
 */

/** Registered delivery channels. Threads (`threads.ts`) is not registered:
 *  the daily payload exists, and nothing here calls the Threads API. */
export const notifiers: Notifier[] = [
  telegramNotifier,
  telegramEnNotifier,
  facebookEnNotifier,
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
/** The digest highlight goes out within this long of its digest, retries
 *  included (3 attempts at the 30-minute cadence). Past it, a digest sent
 *  earlier (by an older deploy, or before a run ran out of subrequests)
 *  gets no late highlight. */
export const HIGHLIGHT_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Trending rank bar, relative to the window: a story must reach the
 *  TRENDING_RANK_PERCENTILE of the last TRENDING_BAR_WINDOW_SEC of published
 *  ranks, so the bar follows the rank scale instead of a fixed number. 0.98
 *  is the top ~8 of ~400 items; the daily cap and gap limit the rest. */
export const TRENDING_RANK_PERCENTILE = 0.98;
export const TRENDING_BAR_WINDOW_SEC = 72 * 60 * 60;
/** The bar never drops below this, so a dead window cannot post its best
 *  weak story. A fresh importance-7 story with no engagement ranks ~5.9 x
 *  qualityFactor; the floor only matters when the window is nearly empty. */
export const TRENDING_RANK_FLOOR = 3;
/** 7, not 8: Jev scores most big stories 7, so at 8 only one story a day
 *  qualified and the channels went silent after the morning digest
 *  (2026-10-01). The rank bar and the daily cap/gap still keep it rare. */
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

/** The `notifications.item_id` of the post that repeats one of the digest's
 *  top stories (`pickDigestHighlight`). It sits under `digest:` so trending's daily count, gap and
 *  posted-events window leave it out; the story itself is already in
 *  `notify_digest_items`, which keeps trending from posting it again. */
export function highlightKey(localDate: string): string {
  return `${digestKey(localDate)}:top`;
}

/** A previous send timed out with no answer (`outcome_unknown`): it may be
 *  posted, so it is never retried, but it is not a confirmed delivery either. */
export type DigestSkipReason =
  | "sent"
  | "no_snapshot"
  | "already_sent"
  | "outcome_unknown"
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
  /** The digest highlight, when this run claimed it. `skipped`: no card
   *  story passed the gate, and it is not tried again. */
  highlight?: "sent" | "send_failed" | "outcome_unknown" | "skipped";
  /** The card story the highlight posted or tried. */
  highlightStory?: string;
  /** Trending candidates this run dropped before sending, by reason
   *  (`dedup:canonical`, `dedup:event`, `gate:chrome`, `gate:short`,
   *  `gate:missing`). A candidate that stays blocked is counted again on
   *  every run that sees it. */
  suppressed?: SuppressionCounts;
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
  posted_at?: number | null;
}

export type StoryRow = Omit<StoryPayload, "media_manifest"> & {
  media_manifest?: string | null;
};

export function hydrateStory(row: StoryRow): StoryPayload {
  const manifest = parseMediaManifest(
    row.media_manifest,
    row.image_url,
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
): Extract<
  DigestSkipReason,
  "before_hour" | "already_sent" | "outcome_unknown"
> | null {
  if (localHour < DIGEST_LOCAL_HOUR) return "before_hour";
  if (!existing) return null;
  if (existing.status === "failed" && existing.attempts < NOTIFY_MAX_ATTEMPTS) {
    return null;
  }
  // An `ambiguous` row is final like `sent`, so it is never resent. Reporting
  // it as `already_sent` would claim a delivery nobody confirmed: the two
  // production timeouts behind #463 left a digest that may or may not be in
  // the channel, and the run record said it went out.
  // A `sending` row is a claim whose send never recorded an answer (another
  // dispatch is mid-send, or it died mid-send): it may be posted, so it is
  // final like `ambiguous`.
  return existing.status === "ambiguous" || existing.status === "sending"
    ? "outcome_unknown"
    : "already_sent";
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
 *  the attempt cap; an `ambiguous` row never retries, because the message may
 *  already be in the channel and a resend would double-post it). */
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
  /** The pipeline's explicit language for the source, or null for English. */
  source_lang?: string | null;
}

/**
 * Copy for a channel in that channel's language only, no fallback: the
 * channel-language translation when it exists, else the source text when the
 * source is already in that language, else null (the story is skipped on
 * this channel). A Vietnamese source (VnExpress) reaches the English channel
 * through its vi→en translation, never as Vietnamese text.
 *
 * The source language is the `source_lang` column, never a diacritic guess:
 * a Vietnamese headline typed without diacritics reads as English and would
 * post on the English channel, and an English headline naming a Vietnamese
 * person reads as Vietnamese and would be skipped there. Most English rows
 * leave `source_lang` null, so only an explicit `vi` is Vietnamese.
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
  const {
    source_title,
    source_summary,
    tr_title,
    tr_summary,
    source_lang,
    ...rest
  } = row;
  const translated = tr_title?.trim();
  if (translated) {
    return {
      ...rest,
      title: translated,
      summary: tr_summary?.trim() || null,
      lang,
    };
  }
  const sourceLang: Lang = source_lang === "vi" ? "vi" : "en";
  if (sourceLang !== lang) return null;
  return { ...rest, title: source_title, summary: source_summary, lang };
}

/** Story columns for a post, as `ChannelCopyRow` plus `StoryRow`: the
 *  source copy and the channel-language translation (`channelCopy`). */
function storyCopySql(lang: Lang): { columns: string; join: string } {
  const trLang = lang === "en" ? "en" : "vi";
  return {
    columns: `i.id, i.url,
                 i.title AS source_title,
                 ${enSummarySql("i")} AS source_summary,
                 i.source_lang AS source_lang,
                 tr.title AS tr_title,
                 tr.summary AS tr_summary,
                 i.image_url, i.media_manifest, i.category,
                 i.points, i.comments, i.rank_score, i.llm_importance`,
    join: `LEFT JOIN translations tr ON tr.item_id = i.id AND tr.lang = '${trLang}'`,
  };
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
  const copy = storyCopySql(lang);
  return {
    sql: `SELECT ${copy.columns},
                 i.source_id, i.duplicate_of
          FROM items i
          LEFT JOIN notifications n ON n.item_id = i.id AND n.channel = ?
            AND (n.status IN ('sent', 'ambiguous', 'sending') OR n.attempts >= ${NOTIFY_MAX_ATTEMPTS})
          ${copy.join}
          WHERE i.status = 'published'
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

/** Today's trending count and the last trending post. A `digest:%` row is
 *  neither: the morning digest must not open the 3-hour gap. */
export const trendingGapSql = `SELECT
         SUM(CASE WHEN item_id NOT LIKE 'digest:%' AND posted_at >= ? THEN 1 ELSE 0 END) AS sent_today,
         MAX(CASE WHEN item_id NOT LIKE 'digest:%' THEN posted_at END) AS last_posted_at
       FROM notifications WHERE channel = ? AND status = 'sent'`;

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
      text: stripEmbeddedChrome(bullet.text),
      url: item ? absoluteSiteUrl(storyPath(item), lang) : null,
      ...(bullet.emoji ? { emoji: bullet.emoji } : {}),
      category: item?.category ?? null,
    };
  });
  const citedItemIds = [
    ...new Set(
      edition.bullets.flatMap((bullet) => [
        ...(bullet.item_id ? [bullet.item_id] : []),
        ...(bullet.item_ids ?? []),
      ])
    ),
  ];
  return { lang, date: edition.date, bullets: resolved, citedItemIds };
}

/** Card tiles the highlight tries, in card order, before it gives up. */
export const HIGHLIGHT_CANDIDATES = 3;

type CardStoryRow = Omit<StoryRow, "title" | "summary" | "lang"> &
  ChannelCopyRow;

/** The highlight's story, and why each card story before it was passed over. */
interface HighlightPick {
  story: StoryPayload;
  passedOver: string[];
}

/** One card story in the channel's language when it passes the gate, else
 *  why not. */
function postableCardStory(
  id: string,
  row: CardStoryRow | undefined,
  lang: Lang
): StoryRow | string {
  if (!row) return `story ${id} not found`;
  const story = channelCopy(row, lang);
  if (!story) return `story ${id} has no ${lang} copy`;
  const gate = postability(story);
  return gate.ok ? story : `story ${id} gate:${gate.reason}`;
}

/**
 * The story the digest highlight posts on this channel: the first of the day
 * card's top HIGHLIGHT_CANDIDATES tiles whose copy in the channel's language
 * (`channelCopy`) passes the trending postability gate. Every card story is
 * already in `notify_digest_items`, so trending never reposts the one picked.
 * A string says why each tile was passed over; a day with no card stories
 * has no highlight.
 */
async function pickDigestHighlight(
  env: Env,
  date: string,
  lang: Lang
): Promise<HighlightPick | string> {
  const card = await loadDayCard(env, date, lang);
  const ids = card?.itemIds.slice(0, HIGHLIGHT_CANDIDATES) ?? [];
  if (ids.length === 0) return "no day card stories";
  const copy = storyCopySql(lang);
  const { results } = await env.DB.prepare(
    `SELECT ${copy.columns} FROM items i ${copy.join}
     WHERE i.id IN (${ids.map(() => "?").join(", ")})`
  )
    .bind(...ids)
    .all<CardStoryRow>();
  const rows = new Map((results ?? []).map((row) => [row.id, row]));
  const passedOver: string[] = [];
  for (const id of ids) {
    const story = postableCardStory(id, rows.get(id), lang);
    if (typeof story !== "string") {
      return { story: hydrateStory(story), passedOver };
    }
    passedOver.push(story);
  }
  return passedOver.join("; ");
}

/** What a claimed highlight came to. A skip is final: no card story passed
 *  the gate and nothing was sent. `storyId` is absent when the pick itself
 *  failed. */
export type HighlightOutcome =
  | { skipped: string }
  | { result: SendResult; storyId?: string };

/**
 * Posts the digest's highlight through `sendStory`, once per channel and
 * local date (`highlightKey`), claimed like every send. Call it only once the
 * day's digest is `sent`: an ambiguous digest may not be in the channel, and
 * its highlight would be a stray post. Only the gate falls through to the
 * next card story; a send that fails is that story's failure, retried by
 * later runs up to NOTIFY_MAX_ATTEMPTS. When no candidate passes, the row is
 * `skipped`, which only the admin force-send reopens. Null when the
 * highlight is already claimed: sent, ambiguous, skipped, in flight or given
 * up.
 */
export async function sendDigestHighlight(
  env: Env,
  notifier: Notifier,
  target: string,
  date: string
): Promise<HighlightOutcome | null> {
  const key = highlightKey(date);
  if (!(await claimDelivery(env, notifier.id, target, key))) return null;
  const picked: { pick?: HighlightPick | string } = {};
  const result = await attemptSend(async () => {
    const pick = await pickDigestHighlight(env, date, notifier.lang);
    picked.pick = pick;
    if (typeof pick === "string") {
      return { ok: false, error: `skipped: ${pick}` };
    }
    const sent = await notifier.sendStory(env, pick.story);
    if (pick.passedOver.length === 0) return sent;
    // Kept on the row, like the Telegram media fallback notes.
    const note = `highlight after ${pick.passedOver.join("; ")}`;
    return { ...sent, error: sent.error ? `${sent.error} | ${note}` : note };
  });
  const { pick } = picked;
  if (typeof pick === "string") {
    await recordSkipped(env, notifier.id, key, `skipped: ${pick}`);
    console.log(`notify(${notifier.id}) highlight skipped: ${pick}`);
    return { skipped: pick };
  }
  await recordDelivery(env, notifier.id, target, key, result);
  if (!result.ok && !result.budgetExhausted) {
    const message = `${notifier.id} highlight ${failureLabel(result)}: ${result.error ?? "unknown"}`;
    console.error(`notify(${message})`);
    if (pick) {
      await reportDeliveryFailure(env, message, {
        channel: notifier.id,
        kind: "highlight",
      });
    }
  }
  return pick ? { result, storyId: pick.story.id } : { result };
}

/** Ends a claimed send that had nothing to post. `skipped` is final for
 *  scheduled runs: `claimDelivery` re-claims only `failed` rows. */
async function recordSkipped(
  env: Pick<Env, "DB">,
  channel: string,
  key: string,
  reason: string
): Promise<void> {
  await env.DB.prepare(
    `UPDATE notifications
     SET status = 'skipped', attempts = attempts + 1, last_error = ?, posted_at = ?
     WHERE channel = ? AND item_id = ?`
  )
    .bind(reason, Date.now(), nn(channel), nn(key))
    .run();
}

/** Makes a skipped highlight claimable again, for the admin force-send. A
 *  skip posted nothing, so this can never lead to a second post. */
async function reopenSkippedHighlight(
  env: Pick<Env, "DB">,
  channel: string,
  date: string
): Promise<void> {
  await env.DB.prepare(
    `UPDATE notifications SET status = 'failed'
     WHERE channel = ? AND item_id = ? AND status = 'skipped'`
  )
    .bind(nn(channel), highlightKey(date))
    .run();
}

/**
 * After a day video is set or posted, edits that language's sent Telegram
 * digest so its "▶ YouTube" button matches `youtubeId` (null removes it).
 * The digest's chat and message id are on its `notifications` row. Says
 * what happened, for the admin response; never throws, so a failed edit
 * never fails the video change.
 */
export async function syncDigestVideoButton(
  env: Env,
  date: string,
  lang: Lang,
  youtubeId: string | null
): Promise<string> {
  const channel = lang === "en" ? telegramEnNotifier : telegramNotifier;
  try {
    const row = await env.DB.prepare(
      `SELECT target, message_id FROM notifications
       WHERE channel = ? AND item_id = ? AND status = 'sent'`
    )
      .bind(channel.id, digestKey(date))
      .first<{ target: string | null; message_id: string | null }>();
    if (!row?.target || !row.message_id) return "no sent digest";
    const result = await editDigestReplyMarkup(
      env,
      row.target,
      row.message_id,
      { date, lang },
      youtubeId
    );
    if (result.ok) return "updated";
    console.error(
      `notify(${channel.id}) digest video button not updated for ${date}: ${result.error}`
    );
    return `edit failed: ${result.error ?? "unknown"}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `notify(${channel.id}) digest video button not updated for ${date}: ${message}`
    );
    return `edit failed: ${message}`;
  }
}

/**
 * Claims one delivery before its send. Inserts a `sending` row, or moves a
 * retryable `failed` row to `sending`, in ONE statement; D1 runs it
 * atomically, so of two concurrent dispatches exactly one sees a changed
 * row. Only that one sends, then `recordDelivery` stamps the outcome.
 *
 * A `sending` row is never re-claimed, however old: it means a send started
 * and no outcome was recorded (the run died, or D1 failed after the post),
 * so nothing proves it was not posted. Like `ambiguous`, it costs at most a
 * missed post, never a second one.
 */
export async function claimDelivery(
  env: Pick<Env, "DB">,
  channel: string,
  target: string,
  key: string
): Promise<boolean> {
  const result = await env.DB.prepare(
    `INSERT INTO notifications (channel, item_id, target, status, attempts, message_id, last_error, posted_at)
     VALUES (?, ?, ?, 'sending', 0, NULL, NULL, ?)
     ON CONFLICT(channel, item_id) DO UPDATE SET
       status = 'sending',
       target = excluded.target,
       posted_at = excluded.posted_at
     WHERE notifications.status = 'failed'
       AND notifications.attempts < ${NOTIFY_MAX_ATTEMPTS}`
  )
    .bind(nn(channel), nn(key), nn(target), Date.now())
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Delivery state is keyed by (channel, item_id) only. `lang` is NOT part of
 * the key: an EN/VI comparison must never create a second row or a second
 * post for the same story. The upsert bumps `attempts` rather than inserting,
 * so a retry updates one row.
 *
 * Status is `sending` (claimed by `claimDelivery`, outcome not yet recorded),
 * `sent`, `failed` (the channel rejected it, nothing was posted,
 * retried up to NOTIFY_MAX_ATTEMPTS) or `ambiguous` (no usable answer, the
 * message may be posted). An `ambiguous` row is final like `sent`: the
 * trending query and the digest gate both skip it, so an unknown outcome costs
 * at most a missed post and never a second one. It is not counted as a post.
 * A highlight with no postable story is `skipped` (`recordSkipped`): final for
 * scheduled runs, and nothing was posted.
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
         status = 'failed',
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
  const digestIdsByLang = new Map<Lang, string[]>();
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
    const suppressed: SuppressionCounts = {};

    // --- 1. Daily TL;DR digest (once per local day) ---
    const existing = await env.DB.prepare(
      "SELECT status, attempts, posted_at FROM notifications WHERE channel = ? AND item_id = ?"
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
      } else if (!(await claimDelivery(env, notifier.id, target, key))) {
        // Another dispatch claimed it between the read above and now.
        digestReason = "outcome_unknown";
      } else {
        let shownIds = digestIdsByLang.get(notifier.lang);
        if (!shownIds) {
          shownIds = await digestItemIds(
            env,
            digest.date,
            notifier.lang,
            digest.citedItemIds ?? []
          );
          digestIdsByLang.set(notifier.lang, shownIds);
        }
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
            `${notifier.id} digest ${failureLabel(result)}: ${result.error ?? "unknown"}`,
            { channel: notifier.id, kind: "digest" }
          );
        } else {
          digestReason = "sent";
        }
        await recordDelivery(env, notifier.id, target, key, result);
        if (result.ok || result.ambiguous) {
          await recordDigestItems(env, notifier.id, digest.date, shownIds);
        }
        if (result.ok) sent[notifier.id]++;
      }
    }

    // --- 1b. The digest's top story, after a digest that surely posted ---
    // A recent `sent` digest from an earlier run counts, so a failed
    // highlight retries; an older one gets no late highlight.
    let highlight: NotifyChannelReason["highlight"];
    let highlightStory: string | undefined;
    const recentDigest =
      existing?.status === "sent" &&
      now - (existing.posted_at ?? 0) <= HIGHLIGHT_WINDOW_MS;
    if (
      notifier.postsDigestHighlight &&
      !budgetSpent &&
      (digestReason === "sent" || recentDigest)
    ) {
      const outcome = await sendDigestHighlight(env, notifier, target, date);
      if (outcome && "skipped" in outcome) {
        highlight = "skipped";
      } else if (outcome) {
        const { result } = outcome;
        if (result.budgetExhausted) budgetSpent = true;
        highlight = result.ok
          ? "sent"
          : result.ambiguous
            ? "outcome_unknown"
            : "send_failed";
        highlightStory = outcome.storyId;
        if (result.ok) sent[notifier.id]++;
      }
    }

    // --- 2. Trending stories (algo-detected, rate-limited) ---
    const stats = await env.DB.prepare(trendingGapSql)
      .bind(dayStartMs, notifier.id)
      .first<{ sent_today: number | null; last_posted_at: number | null }>();

    const importanceFloor = trendingImportanceFloor(
      stats?.sent_today ?? 0,
      stats?.last_posted_at ?? null,
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
              duplicate_of: string | null;
            }
        >();
      const today = buildTrendingSourcesTodayQuery(notifier.id, dayStartMs);
      const { results: sentToday } = await env.DB.prepare(today.sql)
        .bind(...today.binds)
        .all<{ source_id: string; n: number }>();

      // Drop what must not post before the diversity pick, so a rejected
      // candidate frees its slot for the next one instead of leaving the
      // run with nothing.
      const postable = (results ?? []).flatMap((row) => {
        const sourceTitle = row.source_title;
        const copy = channelCopy(row, notifier.lang);
        if (!copy) return [];
        const gate = postability(copy);
        if (!gate.ok) {
          countSuppression(suppressed, `gate:${gate.reason}`);
          return [];
        }
        return [{ copy, source_id: copy.source_id, sourceTitle }];
      });
      let fresh = postable;
      if (postable.length > 0) {
        const posted = await loadPostedEvents(env, notifier.id, now, [
          date,
          getLocalHourAndDate(now - 24 * 60 * 60 * 1000, DIGEST_TIMEZONE).date,
        ]);
        fresh = postable.filter(({ copy, sourceTitle }) => {
          const reason = dedupReason(
            {
              itemId: copy.id,
              canonicalId: copy.duplicate_of ?? copy.id,
              eventKey: eventKey(sourceTitle),
            },
            posted
          );
          if (reason) countSuppression(suppressed, `dedup:${reason}`);
          return reason === null;
        });
      }
      const candidates = pickDiverse(fresh, {
        limit: TRENDING_MAX_PER_DAY,
        maxPerFamily: TRENDING_MAX_PER_FAMILY,
        initialCounts: familyCounts(sentToday ?? []),
      }).map(({ copy }) => {
        const { source_id: _sourceId, duplicate_of: _dup, ...row } = copy;
        return hydrateStory(row);
      });
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
          if (!(await claimDelivery(env, notifier.id, target, story.id))) {
            // Another dispatch claimed this story first.
            trendingReason = "none_unposted";
            continue;
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
              `${notifier.id} trending ${failureLabel(result)}: ${result.error ?? "unknown"}`,
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
      ...(highlight ? { highlight } : {}),
      ...(highlightStory ? { highlightStory } : {}),
      suppressed,
    };
  }

  const report: NotifyRunResult = { sent, reasons };
  console.info("notify", report);
  return report;
}

/** Admin preview: today's VI and EN digests, each followed by its top-story
 *  post, to one chat (staging). Nothing is recorded, so the real 08:00 send
 *  is unaffected. */
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
    const notifier = telegramPreviewNotifier(lang, chatId);
    const result = await notifier.sendDigest(env, digest);
    out[lang] = result.ok
      ? `sent ${result.messageId}`
      : `failed: ${result.error}`;
    if (!result.ok) continue;
    // The digest is already in the staging chat: a failure here is reported,
    // not thrown.
    let storyId = "";
    const top = await attemptSend(async () => {
      const pick = await pickDigestHighlight(env, date, lang);
      if (typeof pick === "string") {
        return { ok: false, error: `skipped: ${pick}` };
      }
      storyId = pick.story.id;
      return notifier.sendStory(env, pick.story);
    });
    out[`${lang}:top`] = top.ok
      ? `sent ${top.messageId} (story ${storyId})`
      : `failed: ${top.error}`;
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
  let enabled = 0;
  for (const notifier of notifiers) {
    // A channel that is off (no Facebook token, no webhook) must not abort
    // the channels that are on, and must not be reported as the reason a
    // digest failed to send.
    if (!notifier.enabled(env)) continue;
    enabled++;
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
    if (result.ok || result.ambiguous) {
      await recordDigestItems(
        env,
        notifier.id,
        digest.date,
        await digestItemIds(
          env,
          digest.date,
          notifier.lang,
          digest.citedItemIds ?? []
        )
      );
    }
    if (result.ok && notifier.postsDigestHighlight) {
      await reopenSkippedHighlight(env, notifier.id, date);
      await sendDigestHighlight(env, notifier, target, date);
    }
    if (result.ok) sent++;
    else return { sent, reason: result.error ?? "send failed" };
  }
  if (enabled === 0) {
    return { sent: 0, reason: "no channel configured" };
  }
  if (!sawSnapshot) {
    return { sent: 0, reason: `no TL;DR snapshot for ${date}` };
  }
  return { sent, reason: sent > 0 ? `sent digest ${date}` : "no channel sent" };
}
