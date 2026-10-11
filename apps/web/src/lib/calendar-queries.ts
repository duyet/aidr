/**
 * Read side of the edition calendar: per audience-zone day of one month,
 * the published story count and the top-ranked story. Never writes.
 */
import { type CalendarDay, type CalendarMonth, shiftMonth } from "./calendar";
import { archiveDateOfSec, dayBoundsSec } from "./day-archive";
import type { DbReader } from "./db";

/** Audience zone is fixed UTC+7 (see `day-archive.ts`). */
const AUDIENCE_OFFSET_SEC = 7 * 3600;

interface DayRow {
  d: string;
  n: number;
  title: string;
  title_vi: string | null;
  image_url: string | null;
  tags: string | null;
}

/** Stored tags JSON → string[]; malformed or missing rows are untagged. */
function parseTags(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export async function getCalendarMonth(
  db: DbReader,
  month: string,
  lastMonth: string
): Promise<CalendarMonth> {
  const start = dayBoundsSec(`${month}-01`).start;
  const end = dayBoundsSec(`${shiftMonth(month, 1)}-01`).start;
  const dayExpr = `date(i.published_at + ${AUDIENCE_OFFSET_SEC}, 'unixepoch')`;
  const [daysRes, firstRes] = await db.batch([
    db
      .prepare(
        `SELECT d, n, title, title_vi, image_url, tags FROM (
           SELECT ${dayExpr} AS d, i.title, t.title AS title_vi, i.image_url, i.tags,
                  COUNT(*) OVER (PARTITION BY ${dayExpr}) AS n,
                  ROW_NUMBER() OVER (
                    PARTITION BY ${dayExpr} ORDER BY i.rank_score DESC
                  ) AS rn
           FROM items i
           LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
           WHERE i.status = 'published'
             AND i.published_at >= ? AND i.published_at < ?
         ) WHERE rn = 1 ORDER BY d`
      )
      .bind(start, end),
    db.prepare(
      "SELECT MIN(published_at) AS at FROM items WHERE status = 'published'"
    ),
  ]);
  const days: CalendarDay[] = ((daysRes.results ?? []) as DayRow[]).map(
    (r) => ({
      date: r.d,
      count: Number(r.n) || 0,
      title: r.title,
      title_vi: r.title_vi?.trim() ? r.title_vi : null,
      image_url: r.image_url || null,
      tags: parseTags(r.tags),
    })
  );
  const at = (firstRes.results?.[0] as { at: number | null } | undefined)?.at;
  const firstDate = typeof at === "number" ? archiveDateOfSec(at) : null;
  return {
    month,
    days,
    firstMonth: firstDate ? firstDate.slice(0, 7) : null,
    lastMonth,
  };
}
