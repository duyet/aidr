/**
 * Read side of the edition calendar: per audience-zone day of one month,
 * the published story count, the top-ranked story, two runner-ups and the
 * three most common categories. Never writes.
 */
import { type CalendarDay, type CalendarMonth, shiftMonth } from "./calendar";
import { archiveDateOfSec, dayBoundsSec } from "./day-archive";
import type { DbReader } from "./db";

/** Audience zone is fixed UTC+7 (see `day-archive.ts`). */
const AUDIENCE_OFFSET_SEC = 7 * 3600;

/** The lead plus two runner-ups per day. */
const STORIES_PER_DAY = 3;
const CATEGORIES_PER_DAY = 3;

interface StoryRow {
  d: string;
  n: number;
  title: string;
  title_vi: string | null;
  image_url: string | null;
  tags: string | null;
}

interface CategoryRow {
  d: string;
  category: string;
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

function translated(raw: string | null): string | null {
  return raw?.trim() ? raw : null;
}

export async function getCalendarMonth(
  db: DbReader,
  month: string,
  lastMonth: string
): Promise<CalendarMonth> {
  const start = dayBoundsSec(`${month}-01`).start;
  const end = dayBoundsSec(`${shiftMonth(month, 1)}-01`).start;
  const dayExpr = `date(i.published_at + ${AUDIENCE_OFFSET_SEC}, 'unixepoch')`;
  const [storiesRes, categoriesRes, firstRes] = await db.batch([
    db
      .prepare(
        `SELECT d, n, title, title_vi, image_url, tags FROM (
           SELECT ${dayExpr} AS d, i.title, t.title AS title_vi, i.image_url, i.tags,
                  COUNT(*) OVER (PARTITION BY ${dayExpr}) AS n,
                  ROW_NUMBER() OVER (
                    PARTITION BY ${dayExpr} ORDER BY i.rank_score DESC, i.id
                  ) AS rn
           FROM items i
           LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
           WHERE i.status = 'published'
             AND i.published_at >= ? AND i.published_at < ?
         ) WHERE rn <= ${STORIES_PER_DAY} ORDER BY d, rn`
      )
      .bind(start, end),
    db
      .prepare(
        `SELECT d, category FROM (
           SELECT ${dayExpr} AS d, i.category,
                  ROW_NUMBER() OVER (
                    PARTITION BY ${dayExpr} ORDER BY COUNT(*) DESC, i.category
                  ) AS rn
           FROM items i
           WHERE i.status = 'published'
             AND i.published_at >= ? AND i.published_at < ?
             AND i.category IS NOT NULL AND i.category != ''
           GROUP BY d, i.category
         ) WHERE rn <= ${CATEGORIES_PER_DAY} ORDER BY d, rn`
      )
      .bind(start, end),
    db.prepare(
      "SELECT MIN(published_at) AS at FROM items WHERE status = 'published'"
    ),
  ]);

  const categoriesByDay = new Map<string, string[]>();
  for (const r of (categoriesRes.results ?? []) as CategoryRow[]) {
    categoriesByDay.set(r.d, [...(categoriesByDay.get(r.d) ?? []), r.category]);
  }
  // Rows arrive ordered by day then rank, so the first row of a day is its lead.
  const byDay = new Map<string, CalendarDay>();
  for (const r of (storiesRes.results ?? []) as StoryRow[]) {
    const day = byDay.get(r.d);
    if (!day) {
      byDay.set(r.d, {
        date: r.d,
        count: Number(r.n) || 0,
        title: r.title,
        title_vi: translated(r.title_vi),
        image_url: r.image_url || null,
        tags: parseTags(r.tags),
        runners: [],
        categories: categoriesByDay.get(r.d) ?? [],
      });
    } else {
      day.runners.push({ title: r.title, title_vi: translated(r.title_vi) });
    }
  }
  const days = [...byDay.values()];

  const at = (firstRes.results?.[0] as { at: number | null } | undefined)?.at;
  const firstDate = typeof at === "number" ? archiveDateOfSec(at) : null;
  return {
    month,
    days,
    firstMonth: firstDate ? firstDate.slice(0, 7) : null,
    lastMonth,
  };
}
