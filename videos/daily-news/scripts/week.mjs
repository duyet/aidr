// ISO-week math for the weekly edition. Pure: no I/O, no clock unless `now` is passed in.
// The Worker keys weekly snapshots by the ISO week (Monday..Sunday) of Asia/Ho_Chi_Minh dates, so the
// video must ask for the same key: `YYYY-Www`, with the ISO year (2027-01-01 is still 2026-W53).
const DAY = 86400000;
const ICT_OFFSET = 7 * 3600000; // Asia/Ho_Chi_Minh is UTC+7 all year (no DST)

const utc = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

// The ISO week of a YYYY-MM-DD date: "2026-W41".
export function isoWeekOf(date) {
  const t = utc(date);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  const thursday = t - dow * DAY + 3 * DAY; // the Thursday decides the ISO year
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function parseWeek(week) {
  const m = /^(\d{4})-W(\d{2})$/.exec(week ?? "");
  if (!m) throw new Error(`week "${week}": expected YYYY-Www, like 2026-W41`);
  const [year, n] = [Number(m[1]), Number(m[2])];
  const jan4 = Date.UTC(year, 0, 4); // Jan 4 is always in week 1
  const week1Monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  const start = ymd(week1Monday + (n - 1) * 7 * DAY);
  if (isoWeekOf(start) !== week)
    throw new Error(`week "${week}" does not exist`);
  return { year, n, start, end: ymd(utc(start) + 6 * DAY) };
}

// Today's date in Asia/Ho_Chi_Minh.
export const ictDate = (now = new Date()) => ymd(now.getTime() + ICT_OFFSET);

// The most recent week that is fully over in Asia/Ho_Chi_Minh: the week containing the date 7 days ago.
export const lastClosedWeek = (now = new Date()) =>
  isoWeekOf(ymd(utc(ictDate(now)) - 7 * DAY));

// "Oct 5–11, 2026", "Oct 28 – Nov 3, 2026", "Dec 28, 2026 – Jan 3, 2027" (`locale` like en-US or vi-VN).
export function formatRange(start, end, locale = "en-US") {
  const fmt = (d, o) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, {
      timeZone: "UTC",
      ...o,
    });
  const [s, e] = [new Date(`${start}T12:00:00Z`), new Date(`${end}T12:00:00Z`)];
  if (s.getUTCFullYear() !== e.getUTCFullYear())
    return `${fmt(start, { month: "short", day: "numeric", year: "numeric" })} – ${fmt(end, { month: "short", day: "numeric", year: "numeric" })}`;
  if (locale.startsWith("vi")) {
    const same = s.getUTCMonth() === e.getUTCMonth();
    return same
      ? `${s.getUTCDate()}–${e.getUTCDate()}/${e.getUTCMonth() + 1}/${e.getUTCFullYear()}`
      : `${s.getUTCDate()}/${s.getUTCMonth() + 1} – ${e.getUTCDate()}/${e.getUTCMonth() + 1}/${e.getUTCFullYear()}`;
  }
  const year = e.getUTCFullYear();
  return s.getUTCMonth() === e.getUTCMonth()
    ? `${fmt(start, { month: "short", day: "numeric" })}–${e.getUTCDate()}, ${year}`
    : `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(end, { month: "short", day: "numeric" })}, ${year}`;
}
