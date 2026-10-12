import type { DbReader } from "./db";
import {
  buildTrends,
  type SystemTrends,
  TREND_DAYS,
  type TrendRow,
} from "./trends";

/** `topic_daily.day` is the UTC date the ingest wrote. Topics need two
 *  mentions in the window, which drops one-off tags before rows leave D1. */
const TOPIC_SQL = `WITH win AS (
    SELECT day, topic, count FROM topic_daily
    WHERE day >= date('now', ?1)
  ),
  keep AS (
    SELECT topic FROM win GROUP BY topic HAVING SUM(count) >= 2
  )
  SELECT day, topic AS name, SUM(count) AS count FROM win
  WHERE topic IN (SELECT topic FROM keep)
  GROUP BY day, topic`;

const CATEGORY_SQL = `SELECT date(published_at, 'unixepoch') AS day,
    COALESCE(category, 'Uncategorized') AS name, COUNT(*) AS count
  FROM items
  WHERE status = 'published' AND published_at >= unixepoch(date('now', ?1))
  GROUP BY day, name`;

const TODAY_SQL = "SELECT date('now') AS today";

export async function loadSystemTrends(db: DbReader): Promise<SystemTrends> {
  const offset = `-${TREND_DAYS - 1} days`;
  const [topics, categories, today] = await db.batch([
    db.prepare(TOPIC_SQL).bind(offset),
    db.prepare(CATEGORY_SQL).bind(offset),
    db.prepare(TODAY_SQL),
  ]);
  const day =
    (today?.results?.[0] as { today?: string } | undefined)?.today ??
    new Date().toISOString().slice(0, 10);
  return buildTrends(
    (topics?.results ?? []) as TrendRow[],
    (categories?.results ?? []) as TrendRow[],
    day
  );
}
