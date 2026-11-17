/**
 * Provisional edition for the in-progress ISO week (`/week/YYYY-Www`
 * before Sunday midnight ICT). The closed weekly build (`worker/weekly.ts`)
 * runs once the week ends, so until then there is nothing stored. This
 * ranks the live window with the same rules — `loadRangeCandidates` and
 * `rankWeeklyCandidates` over `start_date..today`, newest data every
 * request — and writes no LLM copy, no intro, only the title fallback lines
 * the closed edition itself falls back to. It never touches
 * `weekly_snapshots`; the §10b build replaces it when the week closes.
 */
import { AUDIENCE_TIMEZONE, localCalendarDate } from "../../worker/time.js";
import {
  composeWeeklyLines,
  loadRangeCandidates,
  rankWeeklyCandidates,
  WEEKLY_MAX_STORIES,
} from "../../worker/weekly.js";
import { readSession } from "./db";
import { getItemsByIds } from "./feed-queries";
import type { FeedItem, Lang } from "./types";
import { isOpenWeek, lastClosedWeek, weekBounds, weekIssue } from "./week";
import type { WeekEdition, WeekStory } from "./week-model";
import { weekStoryText } from "./week-model";
import { getWeekEdition } from "./week-queries";

/** How many stories the provisional edition carries. Same cap as the closed
 * edition (`WEEKLY_MAX_STORIES`). */
export const OPEN_WEEK_MAX_STORIES = WEEKLY_MAX_STORIES;

export interface OpenWeekEdition extends WeekEdition {
  provisional: true;
}

export interface WeekEditionLoad {
  edition: WeekEdition;
  /** True when a stored snapshot was served (the closed §10b path). */
  stored: boolean;
}

/**
 * The edition to render for a week, or null. Closed weeks serve the stored
 * snapshot; the in-progress week ranks live under the same closed-week
 * rules. A malformed, pre-launch or empty open week is null. A failed read
 * propagates (pages answer 5xx, never an empty story list).
 */
export async function loadWeekEdition(
  db: D1Database,
  week: string,
  nowMs: number
): Promise<WeekEditionLoad | null> {
  const stored = await getWeekEdition(readSession(db), week);
  if (stored) return { edition: stored, stored: true };
  const open = await buildOpenWeekEdition(db, week, nowMs);
  return open ? { edition: open, stored: false } : null;
}

/**
 * The ranked view of the week so far, or null when there is nothing to
 * show (a Monday before the first story lands, a pre-launch week, a bad
 * window). Reads `tldr_snapshots` and `items`; writes nothing.
 */
export async function buildOpenWeekEdition(
  db: D1Database,
  week: string,
  nowMs: number
): Promise<OpenWeekEdition | null> {
  if (!isOpenWeek(week, nowMs)) return null;
  const bounds = weekBounds(week);
  const issue = weekIssue(week);
  if (!bounds || issue === null) return null;
  const today = localCalendarDate(nowMs, AUDIENCE_TIMEZONE);
  // The week can be empty for a few hours after midnight Monday ICT; stop
  // at today so the window is the days that have data.
  const window = { start: bounds.start, end: today };
  const candidates = await loadRangeCandidates({ DB: db }, window);
  const picked = rankWeeklyCandidates(candidates, OPEN_WEEK_MAX_STORIES);
  const lines = composeWeeklyLines(picked, null);
  if (!lines) return null;
  const items = await getItemsByIds(db, lines.item_ids);
  if (items.length === 0) return null;
  const byId = new Map(items.map((item) => [item.id, item]));
  // Ranked pick order survives `getItemsByIds`, which returns input order.
  const stories: WeekStory[] = lines.item_ids.flatMap((id, index) => {
    const item = byId.get(id);
    if (!item) return [];
    const textEn = lines.stories_en.find((l) => l.item_id === id)?.text ?? null;
    const textVi = lines.stories_vi.find((l) => l.item_id === id)?.text ?? null;
    return [{ rank: index + 1, item, text_en: textEn, text_vi: textVi }];
  });
  return {
    week,
    issue,
    start_date: bounds.start,
    end_date: bounds.end,
    intro_en: null,
    intro_vi: null,
    stories,
    prevWeek: lastClosedWeek(nowMs),
    nextWeek: null,
    updated_at: nowMs,
    provisional: true,
  };
}

/** True when a language has nothing to show; the caller 404s like the
 * closed edition. */
export function openWeekHasStories(
  edition: OpenWeekEdition,
  lang: Lang
): boolean {
  return edition.stories.some((s) => weekStoryText(s, lang) !== null);
}

/** How many lines a "provisional" eyebrow should say we are carrying; for
 * the /weeks index pill. `stories.length` after the language filter. */
export function openWeekStoryCount(
  edition: OpenWeekEdition,
  lang: Lang
): number {
  return edition.stories.filter((s) => weekStoryText(s, lang) !== null).length;
}

/** The lead item for thumbnails; null when there is one. */
export function openWeekLead(edition: OpenWeekEdition): FeedItem | undefined {
  return edition.stories[0]?.item;
}
