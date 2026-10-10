/**
 * Why a story ranks where it does and whether the Telegram trending lane
 * posted it. Read-only; reuses the notifier's own bar, budget and hours so
 * the story page cannot drift from what the hourly run decides.
 */
import { archiveDateOfSec, dayBoundsSec } from "../../src/lib/day-archive.js";
import { getLocalHourAndDate } from "../subscribe/send.js";
import { AUDIENCE_TIMEZONE, isActiveHour } from "../time.js";
import {
  buildRankWindowQuery,
  DIGEST_TIMEZONE,
  localDayStartMs,
  TRENDING_MIN_IMPORTANCE,
  trendingGapSql,
  trendingImportanceFloor,
  trendingRankBar,
} from "./index.js";

export const TRENDING_ELIGIBLE_WINDOW_SEC = 24 * 60 * 60;
export const TRENDING_CHANNELS = ["telegram", "telegram-en"] as const;

export type TrendingNotPostedReason =
  | "below_rank"
  | "below_importance"
  | "too_old"
  | "outside_hours"
  | "budget_spent"
  | "pending";

export type TelegramTrendingStatus =
  | { state: "posted"; postedAt: number }
  | { state: "ambiguous"; postedAt: number }
  | { state: "not_posted"; reason: TrendingNotPostedReason };

export interface StoryRanking {
  dayRank: number;
  dayTotal: number;
  rankScore: number;
  importance: number | null;
  bar: number;
  importanceMin: number;
  channels: Record<string, TelegramTrendingStatus>;
}

interface NotificationLite {
  status: string;
  attempts: number;
  posted_at: number;
}

/** Pure verdict for one channel; order mirrors what the run checks. */
export function classifyStoryTrending(input: {
  rankScore: number;
  importance: number | null;
  bar: number;
  publishedAtSec: number;
  nowMs: number;
  localHour: number;
  sentToday: number;
  lastPostedAtMs: number | null;
  notification: NotificationLite | null;
}): TelegramTrendingStatus {
  const n = input.notification;
  if (n?.status === "sent") return { state: "posted", postedAt: n.posted_at };
  if (n?.status === "ambiguous" || n?.status === "sending")
    return { state: "ambiguous", postedAt: n.posted_at };
  const notPosted = (reason: TrendingNotPostedReason) =>
    ({ state: "not_posted", reason }) as const;
  if (input.nowMs / 1000 - input.publishedAtSec > TRENDING_ELIGIBLE_WINDOW_SEC)
    return notPosted("too_old");
  if (input.rankScore < input.bar) return notPosted("below_rank");
  if ((input.importance ?? 0) < TRENDING_MIN_IMPORTANCE)
    return notPosted("below_importance");
  if (!isActiveHour(input.localHour)) return notPosted("outside_hours");
  const floor = trendingImportanceFloor(
    input.sentToday,
    input.lastPostedAtMs,
    input.nowMs
  );
  if (floor === null || (input.importance ?? 0) < floor)
    return notPosted("budget_spent");
  return notPosted("pending");
}

/** Position within the story's Asia/Ho_Chi_Minh day (the same day as the
 *  homepage archive), rank_score desc, ties by id so it is stable. */
export function dayBounds(publishedAtSec: number): [number, number] {
  const date = archiveDateOfSec(publishedAtSec);
  if (!date) return [0, 0];
  const { start, end } = dayBoundsSec(date);
  return [start, end];
}

export async function loadStoryRanking(
  db: D1Database,
  itemId: string,
  nowMs: number = Date.now()
): Promise<StoryRanking | null> {
  const item = await db
    .prepare(
      `SELECT rank_score, llm_importance, published_at FROM items
       WHERE id = ? AND status = 'published'`
    )
    .bind(itemId)
    .first<{
      rank_score: number | null;
      llm_importance: number | null;
      published_at: number;
    }>();
  if (!item) return null;
  const rankScore = item.rank_score ?? 0;
  const [dayStart, dayEnd] = dayBounds(item.published_at);

  const rankWindow = buildRankWindowQuery(nowMs);
  const dayStmt = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN rank_score > ? OR (rank_score = ? AND id < ?) THEN 1 ELSE 0 END) AS ahead
       FROM items WHERE status = 'published' AND published_at >= ? AND published_at < ?`
    )
    .bind(rankScore, rankScore, itemId, dayStart, dayEnd);
  const windowStmt = db.prepare(rankWindow.sql).bind(...rankWindow.binds);
  const notifStmt = db
    .prepare(
      `SELECT channel, status, attempts, posted_at FROM notifications
       WHERE item_id = ? AND channel IN (?, ?)`
    )
    .bind(itemId, ...TRENDING_CHANNELS);
  const dayStartMs = localDayStartMs(nowMs, DIGEST_TIMEZONE);
  const statsStmts = TRENDING_CHANNELS.map((channel) =>
    db.prepare(trendingGapSql).bind(dayStartMs, channel)
  );
  const [dayRes, windowRes, notifRes, ...statRes] = await db.batch([
    dayStmt,
    windowStmt,
    notifStmt,
    ...statsStmts,
  ]);
  const day = (dayRes.results?.[0] ?? { total: 1, ahead: 0 }) as {
    total: number;
    ahead: number | null;
  };
  const bar = trendingRankBar(
    ((windowRes.results ?? []) as { rank_score: number | null }[]).map(
      (r) => r.rank_score ?? 0
    )
  );
  const notifications = new Map(
    (
      (notifRes.results ?? []) as (NotificationLite & { channel: string })[]
    ).map((r) => [r.channel, r])
  );
  const { hour } = getLocalHourAndDate(nowMs, AUDIENCE_TIMEZONE);
  const channels: Record<string, TelegramTrendingStatus> = {};
  TRENDING_CHANNELS.forEach((channel, i) => {
    const stats = (statRes[i]?.results?.[0] ?? {}) as {
      sent_today?: number | null;
      last_posted_at?: number | null;
    };
    channels[channel] = classifyStoryTrending({
      rankScore,
      importance: item.llm_importance,
      bar,
      publishedAtSec: item.published_at,
      nowMs,
      localHour: hour,
      sentToday: stats.sent_today ?? 0,
      lastPostedAtMs: stats.last_posted_at ?? null,
      notification: notifications.get(channel) ?? null,
    });
  });
  return {
    dayRank: (day.ahead ?? 0) + 1,
    dayTotal: day.total,
    rankScore,
    importance: item.llm_importance,
    bar,
    importanceMin: TRENDING_MIN_IMPORTANCE,
    channels,
  };
}
