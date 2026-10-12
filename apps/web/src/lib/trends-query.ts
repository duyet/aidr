import type { DbReader } from "./db";
import {
  buildTrends,
  type SystemTrends,
  TREND_DAYS,
  type TrendRow,
} from "./trends";

/** `topic_daily.day` is an Asia/Ho_Chi_Minh date (`learningDayKey` in
 *  worker/topic-learning.ts), a fixed UTC+7 with no DST. Every query buckets
 *  on that same day so topics and categories line up. Topics need two
 *  mentions in the window, which drops one-off tags before rows leave D1. */
const TZ = "+7 hours";
const TZ_SECONDS = 7 * 3600;
const TOPIC_SQL = `WITH win AS (
    SELECT day, topic, count FROM topic_daily
    WHERE day >= date('now', ?1, ?2)
  ),
  keep AS (
    SELECT topic FROM win GROUP BY topic HAVING SUM(count) >= 2
  )
  SELECT day, topic AS name, SUM(count) AS count FROM win
  WHERE topic IN (SELECT topic FROM keep)
  GROUP BY day, topic`;

const CATEGORY_SQL = `SELECT date(published_at, 'unixepoch', ?1) AS day,
    COALESCE(category, 'Uncategorized') AS name, COUNT(*) AS count
  FROM items
  WHERE status = 'published'
    AND published_at >= unixepoch(date('now', ?1, ?2)) - ?3
  GROUP BY day, name`;

const TODAY_SQL = "SELECT date('now', ?1) AS today";

export async function loadSystemTrends(db: DbReader): Promise<SystemTrends> {
  const offset = `-${TREND_DAYS - 1} days`;
  const [topics, categories, today] = await db.batch([
    db.prepare(TOPIC_SQL).bind(TZ, offset),
    db.prepare(CATEGORY_SQL).bind(TZ, offset, TZ_SECONDS),
    db.prepare(TODAY_SQL).bind(TZ),
  ]);
  const day =
    (today?.results?.[0] as { today?: string } | undefined)?.today ??
    new Date(Date.now() + TZ_SECONDS * 1000).toISOString().slice(0, 10);
  return buildTrends(
    (topics?.results ?? []) as TrendRow[],
    (categories?.results ?? []) as TrendRow[],
    day
  );
}
