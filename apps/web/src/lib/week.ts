/**
 * Pure ISO-week rules for the weekly edition (`/week/YYYY-Www`).
 *
 * A week is the ISO 8601 week (Monday..Sunday) of audience-zone dates
 * (`AUDIENCE_TIMEZONE`, Asia/Ho_Chi_Minh): the same calendar days the daily
 * `tldr_snapshots.date` rows and `/date/YYYY-MM-DD` pages use, so a week is
 * exactly seven day pages. The ingest step, the page, the Markdown twin, the
 * JSON API and the video script (`videos/daily-news/scripts/week.mjs`) must
 * all compute the same key, or one of them asks for a week nobody stored.
 */
import { AUDIENCE_TIMEZONE, localCalendarDate } from "../../worker/time.js";
import { DAY_ARCHIVE_SETTLED_CACHE_CONTROL } from "./day-archive";
import { withLang } from "./locale-url";
import type { Lang } from "./types";

const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Issue 1 of the weekly edition. Issue numbers count ISO weeks from here,
 * so backfilling or rebuilding a week never renumbers the others. Earlier
 * weeks have no edition and 404. */
export const WEEKLY_FIRST_WEEK = "2026-W40";

function utcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO week key (`YYYY-Www`) of a `YYYY-MM-DD` calendar date. The ISO year
 * can differ from the calendar year at the edges (2027-01-01 is 2026-W53). */
export function isoWeekOfDate(date: string): string {
  const ms = utcMs(date);
  const day = new Date(ms).getUTCDay() || 7; // Mon=1..Sun=7
  // The Thursday of this week decides the ISO year.
  const thursday = new Date(ms + (4 - day) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function isoYearStartMs(year: number): number {
  const jan4 = Date.UTC(year, 0, 4);
  const day = new Date(jan4).getUTCDay() || 7;
  return jan4 - (day - 1) * DAY_MS;
}

/** Monday..Sunday dates of a well-formed week key, or null when the key is
 * malformed or names a week the ISO year does not have (W53 of a 52-week
 * year does not round-trip). */
export function weekDates(week: string): string[] | null {
  const match = WEEK_RE.exec(week);
  if (!match) return null;
  const year = Number(match[1]);
  const num = Number(match[2]);
  if (num < 1 || num > 53) return null;
  const monday = isoYearStartMs(year) + (num - 1) * 7 * DAY_MS;
  const dates = Array.from({ length: 7 }, (_, i) =>
    isoDate(monday + i * DAY_MS)
  );
  return isoWeekOfDate(dates[0]) === week ? dates : null;
}

export function weekBounds(
  week: string
): { start: string; end: string } | null {
  const dates = weekDates(week);
  return dates ? { start: dates[0], end: dates[6] } : null;
}

export function shiftWeek(week: string, delta: number): string | null {
  const dates = weekDates(week);
  if (!dates) return null;
  return isoWeekOfDate(isoDate(utcMs(dates[0]) + delta * 7 * DAY_MS));
}

/** Newest week whose Sunday is already over in the audience zone. On a
 * Monday (ICT) that is the week that just ended. */
export function lastClosedWeek(nowMs: number): string {
  const today = localCalendarDate(nowMs, AUDIENCE_TIMEZONE);
  return isoWeekOfDate(isoDate(utcMs(today) - 7 * DAY_MS));
}

function weeksBetween(a: string, b: string): number | null {
  const da = weekDates(a);
  const db = weekDates(b);
  if (!da || !db) return null;
  return Math.round((utcMs(db[0]) - utcMs(da[0])) / (7 * DAY_MS));
}

export function weekIssue(week: string): number | null {
  const diff = weeksBetween(WEEKLY_FIRST_WEEK, week);
  return diff === null || diff < 0 ? null : diff + 1;
}

/**
 * A closed, well-formed week at or after `WEEKLY_FIRST_WEEK`, else null.
 * The week still in progress has no edition yet, so it is rejected like a
 * future date on the day archive.
 */
export function parseWeek(raw: unknown, nowMs: number): string | null {
  if (typeof raw !== "string") return null;
  const week = raw.toUpperCase();
  if (!weekDates(week)) return null;
  if (weekIssue(week) === null) return null;
  const closed = lastClosedWeek(nowMs);
  const ahead = weeksBetween(closed, week);
  if (ahead === null || ahead > 0) return null;
  return week;
}

export function weekOfArchiveDate(date: string): string | null {
  return DATE_RE.test(date) && Number.isFinite(utcMs(date))
    ? isoWeekOfDate(date)
    : null;
}

export function weekPath(week: string, lang?: Lang): string {
  const path = `/week/${week}`;
  return lang ? withLang(path, lang) : path;
}

export function weekMarkdownPath(week: string, lang?: Lang): string {
  const path = `/week/${week}.md`;
  return lang ? withLang(path, lang) : path;
}

export const WEEKS_INDEX_PATH = "/weeks";

/** `Oct 5 – 11, 2026` / `5 – 11 tháng 10, 2026`, from the two ISO dates. */
export function formatWeekRange(
  start: string,
  end: string,
  lang: Lang
): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (lang === "vi") {
    return sm === em
      ? `${sd} – ${ed} tháng ${em}, ${ey}`
      : `${sd}/${sm} – ${ed}/${em}, ${ey}`;
  }
  const month = (m: number) =>
    new Date(Date.UTC(2000, m - 1, 1)).toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
  if (sy !== ey) {
    return `${month(sm)} ${sd}, ${sy} – ${month(em)} ${ed}, ${ey}`;
  }
  return sm === em
    ? `${month(sm)} ${sd} – ${ed}, ${ey}`
    : `${month(sm)} ${sd} – ${month(em)} ${ed}, ${ey}`;
}

/** Settled weeks never change (their days are past the rank-settle window
 * and the edition is written once); the newest week may still be upgraded
 * from a title fallback, so it caches briefly. Settled pages share the day
 * archive's cap, which keeps cached HTML inside `ASSET_RETENTION_MS`. */
export function weekCacheControl(week: string, nowMs: number): string {
  return week === lastClosedWeek(nowMs)
    ? "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
    : DAY_ARCHIVE_SETTLED_CACHE_CONTROL;
}
