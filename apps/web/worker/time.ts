/**
 * Normalizes a possibly-millisecond epoch timestamp to epoch seconds.
 * Any adapter, LLM response, or accidental `Date.now()` can hand us a
 * millisecond value; the schema and downstream consumers store/expect
 * epoch seconds throughout.
 *
 * 1e12 seconds is year ~33658, well beyond any real timestamp, while a
 * genuine millisecond timestamp for anything after 2001 exceeds it — so
 * treating anything above it as milliseconds is safe and unambiguous.
 */
export function toEpochSeconds(value: number): number {
  return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
}

/** Audience timezone: the channel and homepage are Vietnamese-first. */
export const AUDIENCE_TIMEZONE = "Asia/Ho_Chi_Minh";

/** Local audience hours [start, end) when readers are awake. Trending posts
 *  go out only in this window, and a quiet channel is only unexpected in it. */
export const ACTIVE_HOUR_START = 9;
export const ACTIVE_HOUR_END = 23;

export function isActiveHour(localHour: number): boolean {
  return localHour >= ACTIVE_HOUR_START && localHour < ACTIVE_HOUR_END;
}

/**
 * Local calendar date (YYYY-MM-DD) for `nowMs` in `timezone`. Shared by
 * the TL;DR snapshot key and the Telegram digest lookup so they cannot
 * disagree across the UTC/ICT midnight gap.
 */
export function localCalendarDate(nowMs: number, timezone: string): string {
  const parts = Object.fromEntries(
    calendarDateFormat(timezone)
      .formatToParts(new Date(nowMs))
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Building an Intl.DateTimeFormat loads timezone data each time. The feed
// files every row by audience day, so one formatter per timezone is kept.
const calendarDateFormats = new Map<string, Intl.DateTimeFormat>();

function calendarDateFormat(timezone: string): Intl.DateTimeFormat {
  let format = calendarDateFormats.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    calendarDateFormats.set(timezone, format);
  }
  return format;
}
