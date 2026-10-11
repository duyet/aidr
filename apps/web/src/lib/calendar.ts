/**
 * Pure month rules for the edition calendar (`/calendar?month=YYYY-MM`).
 * Days are audience-zone days, the same key as `/date/YYYY-MM-DD`
 * (see `day-archive.ts`).
 */
import { latestArchiveDate } from "./day-archive";
import { withLang } from "./locale-url";
import type { Lang } from "./types";

export const CALENDAR_PATH = "/calendar";

const MONTH_RE = /^(\d{4})-(\d{2})$/;

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

export function formatMonthHeading(month: string, lang: Lang): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(
    lang === "vi" ? "vi-VN" : "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" }
  );
}
