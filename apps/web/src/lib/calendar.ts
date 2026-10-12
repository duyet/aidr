/**
 * Pure month rules for the edition calendar (`/calendar?month=YYYY-MM`).
 * Days are audience-zone days, the same key as `/date/YYYY-MM-DD`
 * (see `day-archive.ts`).
 */
import { latestArchiveDate } from "./day-archive";
import { withLang } from "./locale-url";
import type { Lang } from "./types";
import { isoWeekOfDate, weekIssue } from "./week";

export const CALENDAR_PATH = "/calendar";

const MONTH_RE = /^(\d{4})-(\d{2})$/;

/** A story ranked below the day's lead, shown as a runner-up in the preview. */
export interface CalendarRunner {
  title: string;
  /** Vietnamese title; null when not translated (no fallback to English). */
  title_vi: string | null;
}

export interface CalendarDay {
  date: string;
  /** Published stories that day. */
  count: number;
  /** The day's top-ranked story. */
  title: string;
  /** Vietnamese title; null when not translated (no fallback to English). */
  title_vi: string | null;
  image_url: string | null;
  /** Top story's tags, for the same keyword highlight as the feed. */
  tags: string[];
  /** Up to 2 stories ranked just below the lead. */
  runners: CalendarRunner[];
  /** The day's 3 most common categories, most common first. */
  categories: string[];
}

export interface CalendarMonth {
  month: string;
  /** Days with at least one story, ascending. */
  days: CalendarDay[];
  /** Earliest month with a story; null when the archive is empty. */
  firstMonth: string | null;
  /** Month of today in the audience zone. */
  lastMonth: string;
}

export function currentMonth(nowMs: number): string {
  return latestArchiveDate(nowMs).slice(0, 7);
}

/** A valid `YYYY-MM` not after the current month, else null. */
export function parseMonth(raw: unknown, nowMs: number): string | null {
  if (typeof raw !== "string") return null;
  const m = MONTH_RE.exec(raw);
  if (!m) return null;
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  if (raw > currentMonth(nowMs)) return null;
  return raw;
}

/** `YYYY-MM` shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Weekday of the 1st, Monday = 0. */
export function firstWeekdayMon0(month: string): number {
  const dow = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  return (dow + 6) % 7;
}

/** Grid cells for a month, Monday first: null pads, then each `YYYY-MM-DD`. */
export function monthCells(month: string): (string | null)[] {
  return [
    ...Array.from({ length: firstWeekdayMon0(month) }, () => null),
    ...Array.from(
      { length: daysInMonth(month) },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`
    ),
  ];
}

/**
 * Heat level 0–4 for a story count, relative to the busiest day shown, so a
 * quiet month still reads as a ramp.
 */
export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const r = count / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

export function calendarPath(month?: string, lang?: Lang): string {
  const path = month ? `${CALENDAR_PATH}?month=${month}` : CALENDAR_PATH;
  return lang ? withLang(path, lang) : path;
}

/** ISO weeks (Mon–Sun) touching `month` that have a weekly edition: at or
 * after `WEEKLY_FIRST_WEEK` and before the week `today` falls in. */
export function monthWeeks(month: string, today: string): string[] {
  const current = isoWeekOfDate(today);
  const weeks = new Set<string>();
  for (const date of monthCells(month)) {
    if (!date) continue;
    const week = isoWeekOfDate(date);
    if (week < current && weekIssue(week) !== null) weeks.add(week);
  }
  return [...weeks];
}

/**
 * Where arrow keys go in the month grid. Left/right step one day, up/down
 * one week, Home/End jump to the first/last edition. Days without an edition
 * are skipped: the target is the nearest edition in that direction, or
 * `current` when there is none.
 */
export function moveDay(dates: string[], current: string, key: string): string {
  if (dates.length === 0) return current;
  if (key === "Home") return dates[0];
  if (key === "End") return dates[dates.length - 1];
  const vertical = key === "ArrowUp" || key === "ArrowDown";
  if (!vertical && key !== "ArrowLeft" && key !== "ArrowRight") return current;
  const step = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  const target = new Date(
    Date.parse(`${current}T00:00:00Z`) + step * (vertical ? 7 : 1) * 86_400_000
  )
    .toISOString()
    .slice(0, 10);
  const found =
    step > 0
      ? dates.find((d) => d >= target)
      : [...dates].reverse().find((d) => d <= target);
  return found ?? current;
}
