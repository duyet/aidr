/*
 * ISO-week helpers for the "This week" rail block. A port of the pure parts of
 * apps/web/src/lib/week.ts: a week is Monday..Sunday of audience-zone
 * (Asia/Ho_Chi_Minh) dates, and issue 1 is WEEKLY_FIRST_WEEK.
 */

export const AUDIENCE_TIMEZONE = "Asia/Ho_Chi_Minh";
export const WEEKLY_FIRST_WEEK = "2026-W40";

const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const DAY_MS = 86_400_000;

const utcMs = (date) => Date.parse(`${date}T00:00:00Z`);
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Local calendar date (YYYY-MM-DD) of `nowMs` in the audience zone. */
export function audienceDate(nowMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: AUDIENCE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(nowMs))
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** ISO week key (`YYYY-Www`) of a `YYYY-MM-DD` date. */
export function isoWeekOfDate(date) {
  const ms = utcMs(date);
  const day = new Date(ms).getUTCDay() || 7;
  const thursday = new Date(ms + (4 - day) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function isoYearStartMs(year) {
  const jan4 = Date.UTC(year, 0, 4);
  const day = new Date(jan4).getUTCDay() || 7;
  return jan4 - (day - 1) * DAY_MS;
}

/** Monday..Sunday dates of a well-formed week key, or null. */
export function weekDates(week) {
  const match = WEEK_RE.exec(week);
  if (!match) return null;
  const year = Number(match[1]);
  const num = Number(match[2]);
  if (num < 1 || num > 53) return null;
  const monday = isoYearStartMs(year) + (num - 1) * 7 * DAY_MS;
  const dates = Array.from({ length: 7 }, (_, i) => isoDate(monday + i * DAY_MS));
  return isoWeekOfDate(dates[0]) === week ? dates : null;
}

/** Newest week whose Sunday is already over in the audience zone. */
export function lastClosedWeek(nowMs) {
  return isoWeekOfDate(isoDate(utcMs(audienceDate(nowMs)) - 7 * DAY_MS));
}

/** Issue number of a week, or null before the first issue. */
export function weekIssue(week) {
  const a = weekDates(WEEKLY_FIRST_WEEK);
  const b = weekDates(week);
  if (!a || !b) return null;
  const diff = Math.round((utcMs(b[0]) - utcMs(a[0])) / (7 * DAY_MS));
  return diff < 0 ? null : diff + 1;
}

/** `Oct 5 – 11, 2026` / `5 – 11 tháng 10, 2026`, from the two ISO dates. */
export function formatWeekRange(start, end, lang) {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (lang === "vi") {
    return sm === em
      ? `${sd} – ${ed} tháng ${em}, ${ey}`
      : `${sd}/${sm} – ${ed}/${em}, ${ey}`;
  }
  const month = (m) =>
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

/** The last closed week as the rail shows it, or null. */
export function lastClosedEdition(nowMs, lang) {
  const week = lastClosedWeek(nowMs);
  const dates = weekDates(week);
  const issue = weekIssue(week);
  if (!dates || issue === null) return null;
  return {
    week,
    issue,
    range: formatWeekRange(dates[0], dates[6], lang),
  };
}
