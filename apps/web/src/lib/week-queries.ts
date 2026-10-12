/**
 * Read side of the weekly edition (`weekly_snapshots`, migration 0056).
 * Never writes. The page, the Markdown twin and `/api/week/<week>` all read
 * through here so they show the same stories in the same order.
 */
import type { DbReader } from "./db";
import { getItemsByIds } from "./feed-queries";
import { publisherHost } from "./publisher-host";
import type { FeedItem } from "./types";
import {
  parseJsonArray,
  parseStoryLines,
  type WeekEdition,
  type WeekSummary,
} from "./week-model";

/** Bound on the `/weeks` index. Two years of issues. */
export const WEEKS_INDEX_LIMIT = 104;

interface WeekRow {
  week: string;
  issue: number;
  start_date: string;
  end_date: string;
  item_ids: string;
  intro_en: string | null;
  intro_vi: string | null;
  stories_en: string;
  stories_vi: string;
  updated_at: number;
}

const WEEK_ROW_SQL = `SELECT week, issue, start_date, end_date, item_ids,
  intro_en, intro_vi, stories_en, stories_vi, updated_at
  FROM weekly_snapshots WHERE week = ? LIMIT 1`;

/** One week's edition, or null when there is no row (or the table is not
 * migrated yet). */
export async function getWeekEdition(
  db: DbReader,
  week: string
): Promise<WeekEdition | null> {
  let row: WeekRow | null = null;
  let prevWeek: string | null = null;
  let nextWeek: string | null = null;
  try {
    const [rowRes, prevRes, nextRes] = await db.batch([
      db.prepare(WEEK_ROW_SQL).bind(week),
      db
        .prepare(
          "SELECT week FROM weekly_snapshots WHERE week < ? ORDER BY week DESC LIMIT 1"
        )
        .bind(week),
      db
        .prepare(
          "SELECT week FROM weekly_snapshots WHERE week > ? ORDER BY week ASC LIMIT 1"
        )
        .bind(week),
    ]);
    row = ((rowRes.results ?? [])[0] as WeekRow | undefined) ?? null;
    prevWeek =
      ((prevRes.results ?? [])[0] as { week?: string } | undefined)?.week ??
      null;
    nextWeek =
      ((nextRes.results ?? [])[0] as { week?: string } | undefined)?.week ??
      null;
  } catch {
    // weekly_snapshots not migrated yet: no edition
    return null;
  }
  if (!row) return null;
  const ids = parseJsonArray(row.item_ids).filter(
    (id): id is string => typeof id === "string"
  );
  const en = parseStoryLines(row.stories_en);
  const vi = parseStoryLines(row.stories_vi);
  const items = await getItemsByIds(db, ids);
  return {
    week: row.week,
    issue: row.issue,
    start_date: row.start_date,
    end_date: row.end_date,
    intro_en: row.intro_en?.trim() || null,
    intro_vi: row.intro_vi?.trim() || null,
    stories: items.map((item, index) => ({
      rank: index + 1,
      item,
      text_en: en.get(item.id) ?? null,
      text_vi: vi.get(item.id) ?? null,
    })),
    prevWeek,
    nextWeek,
    updated_at: row.updated_at,
  };
}

/** Newest first, for `/weeks`. Empty when the table is not migrated. */
export async function listWeekEditions(db: DbReader): Promise<WeekSummary[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT week, issue, start_date, end_date, intro_en, intro_vi,
           json_array_length(item_ids) AS stories
         FROM weekly_snapshots ORDER BY week DESC LIMIT ${WEEKS_INDEX_LIMIT}`
      )
      .all<WeekSummary>();
    return (results ?? []).map((r) => ({
      ...r,
      intro_en: r.intro_en?.trim() || null,
      intro_vi: r.intro_vi?.trim() || null,
      stories: Number(r.stories) || 0,
    }));
  } catch {
    return [];
  }
}

/** Week key that has an edition, or null. A cheap probe for the day page's
 * "this week" link so it never points at a 404. */
export async function weekEditionExists(
  db: DbReader,
  week: string
): Promise<boolean> {
  try {
    const row = await db
      .prepare("SELECT 1 AS yes FROM weekly_snapshots WHERE week = ? LIMIT 1")
      .bind(week)
      .first();
    return row !== null;
  } catch {
    return false;
  }
}

/** The JSON contract of `GET /api/week/<week>`, read by the weekly video
 * (`videos/daily-news/scripts/fetch-week.mjs`). Both languages, each in its
 * own field; `text_vi` / `intro_vi` are null (or empty) when Vietnamese is
 * not ready, never English. */
export interface WeekApiResponse {
  week: string;
  issue: number;
  start_date: string;
  end_date: string;
  intro_en: string;
  intro_vi: string;
  stories: {
    rank: number;
    item_id: string;
    text_en: string | null;
    text_vi: string | null;
    title: string;
    title_vi: string | null;
    category: string | null;
    source: string | null;
    url: string;
    path: string;
    image_url: string | null;
    media_images: string[];
    days: number | null;
    votes: number;
  }[];
  created_at: number;
}

export function weekApiBody(
  edition: WeekEdition,
  storyPathOf: (item: FeedItem) => string
): WeekApiResponse {
  return {
    week: edition.week,
    issue: edition.issue,
    start_date: edition.start_date,
    end_date: edition.end_date,
    intro_en: edition.intro_en ?? "",
    intro_vi: edition.intro_vi ?? "",
    stories: edition.stories.map((s) => ({
      rank: s.rank,
      item_id: s.item.id,
      text_en: s.text_en,
      text_vi: s.text_vi,
      title: s.item.title,
      title_vi: s.item.title_vi,
      category: s.item.category,
      source: publisherHost(s.item.url),
      url: s.item.url,
      path: storyPathOf(s.item),
      image_url: s.item.image_url,
      media_images: (s.item.media_manifest?.assets ?? [])
        .filter((a) => a.type === "image" && typeof a.url === "string")
        .map((a) => a.url)
        .slice(0, 4),
      days: null,
      votes: s.item.vote_net ?? 0,
    })),
    created_at: edition.updated_at,
  };
}
