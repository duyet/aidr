/**
 * How often a subscriber gets mail, stored in `subscribers.frequency`.
 * - `daily`: the TL;DR digest each morning (column default).
 * - `weekly`: the weekly edition (`weekly_snapshots`, `/week/YYYY-Www`)
 *   once, on Monday morning local time, and no daily digest.
 * Shared by the Worker and the browser forms, so keep it dependency-free.
 */
export const MAIL_FREQUENCIES = ["daily", "weekly"] as const;

export type MailFrequency = (typeof MAIL_FREQUENCIES)[number];

export function normalizeMailFrequency(value: unknown): MailFrequency {
  return value === "weekly" ? "weekly" : "daily";
}

/** Weekday a weekly subscriber gets their digest, in their own timezone,
 *  stored in `subscribers.weekly_day`: 0 = Sunday … 6 = Saturday (the JS
 *  `getDay()` numbering). Monday by default, the day the ISO-week edition
 *  closes. Listed Monday-first for the pickers. */
export const WEEKLY_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export type WeeklyDay = (typeof WEEKLY_DAYS)[number];

export const DEFAULT_WEEKLY_DAY: WeeklyDay = 1;

export function normalizeWeeklyDay(value: unknown): WeeklyDay {
  const n =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return WEEKLY_DAYS.includes(n as WeeklyDay)
    ? (n as WeeklyDay)
    : DEFAULT_WEEKLY_DAY;
}

const WEEKDAY_NAMES: Record<"en" | "vi", readonly string[]> = {
  en: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
  vi: [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ],
};

export function weekdayName(day: WeeklyDay, lang: "en" | "vi"): string {
  return WEEKDAY_NAMES[lang][day] ?? WEEKDAY_NAMES[lang][DEFAULT_WEEKLY_DAY];
}
