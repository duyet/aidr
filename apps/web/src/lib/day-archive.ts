/**
 * Pure date rules for the day archive page (`/date/YYYY-MM-DD`).
 *
 * A day is the audience calendar day (`AUDIENCE_TIMEZONE`,
 * Asia/Ho_Chi_Minh) — the key `tldr_snapshots.date` is written under and the
 * day the Telegram and email editions are sent for (ALGORITHM.md §10–12), so
 * the page's digest and story list describe the same day.
 */
import { AUDIENCE_TIMEZONE, localCalendarDate } from "../../worker/time.js";
import { withLang } from "./locale-url";
import type { Lang } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_SEC = 86_400;

/** Ranks still move for 72h after publish (ALGORITHM.md §7); then a day freezes. */
const DAY_ARCHIVE_SETTLE_DAYS = 3;

/** Settled past days: the stories and digest no longer change. */
export const DAY_ARCHIVE_SETTLED_CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
/** Today and the last few days: ranks and the digest still update hourly. */
export const DAY_ARCHIVE_RECENT_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

/**
 * `AUDIENCE_TIMEZONE` as a fixed offset. Vietnam has used UTC+7 with no DST
 * since 1975; `day-archive.test.ts` checks this against `localCalendarDate`.
 */
const AUDIENCE_UTC_OFFSET = "+07:00";

/** Latest date a day page may exist for: today in the audience zone. */
export function latestArchiveDate(nowMs: number): string {
  return localCalendarDate(nowMs, AUDIENCE_TIMEZONE);
}

/**
 * A real calendar date in `YYYY-MM-DD` that is not in the future, else
 * null. `2026-02-30` does not round-trip and is rejected.
 */
export function parseArchiveDate(raw: unknown, nowMs: number): string | null {
  if (typeof raw !== "string" || !DATE_RE.test(raw)) return null;
  const ms = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  if (new Date(ms).toISOString().slice(0, 10) !== raw) return null;
  if (raw > latestArchiveDate(nowMs)) return null;
  return raw;
}

/** `[start, end)` epoch seconds of the audience-zone day. */
export function dayBoundsSec(date: string): { start: number; end: number } {
  const start = Math.floor(
    Date.parse(`${date}T00:00:00${AUDIENCE_UTC_OFFSET}`) / 1000
  );
  return { start, end: start + DAY_SEC };
}

/** Audience-zone date of an epoch-seconds timestamp, or null when unusable. */
export function archiveDateOfSec(sec: number): string | null {
  const ms = sec * 1000;
  return Number.isFinite(new Date(ms).getTime())
    ? localCalendarDate(ms, AUDIENCE_TIMEZONE)
    : null;
}

export function dayArchivePath(date: string, lang?: Lang): string {
  const path = `/date/${date}`;
  return lang ? withLang(path, lang) : path;
}

/** Day card image (`/api/og/date/YYYY-MM-DD.png`), see `lib/day-og.tsx`. */
export function dayArchiveOgPath(date: string, lang?: Lang): string {
  const path = `/api/og/date/${date}.png`;
  return lang ? withLang(path, lang) : path;
}

/** Markdown twin of a day page: `/date/YYYY-MM-DD.md`. */
export function dayArchiveMarkdownPath(date: string, lang?: Lang): string {
  const path = `/date/${date}.md`;
  return lang ? withLang(path, lang) : path;
}

/** True once a day is past the rank-settle window and no longer changes. */
export function isSettledArchiveDate(date: string, nowMs: number): boolean {
  const settledBefore = localCalendarDate(
    nowMs - DAY_ARCHIVE_SETTLE_DAYS * DAY_SEC * 1000,
    AUDIENCE_TIMEZONE
  );
  return date < settledBefore;
}

export function dayArchiveCacheControl(date: string, nowMs: number): string {
  return isSettledArchiveDate(date, nowMs)
    ? DAY_ARCHIVE_SETTLED_CACHE_CONTROL
    : DAY_ARCHIVE_RECENT_CACHE_CONTROL;
}
