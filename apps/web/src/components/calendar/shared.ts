import type { CalendarDay } from "../../lib/calendar";
import type { Lang } from "../../lib/types";

/** Heat steps use the feed's accent (the same amber as home highlights). */
export const HEAT_CLASS = [
  "bg-muted/60",
  "bg-accent/15",
  "bg-accent/35",
  "bg-accent/65 text-accent-foreground",
  "bg-accent text-accent-foreground",
] as const;

export const WEEKDAYS: Record<Lang, string[]> = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  vi: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
};

export function dayTitle(day: CalendarDay, lang: Lang): string | null {
  return lang === "vi" ? day.title_vi : day.title;
}

export function storiesLabel(n: number, lang: Lang): string {
  if (lang === "vi") return `${n} tin`;
  return n === 1 ? "1 story" : `${n} stories`;
}

/** Header popover/sheet ramp: brand yellow via `--heat-*` tokens, by heat level. */
export const HEADER_HEAT_CLASS = [
  "",
  "bg-heat-1 text-heat-1-fg",
  "bg-heat-2 text-heat-2-fg",
  "bg-heat-3 text-heat-3-fg",
  "bg-heat-4 text-heat-4-fg",
] as const;

export const WEEKDAY_INITIALS: Record<Lang, string[]> = {
  en: ["M", "T", "W", "T", "F", "S", "S"],
  vi: WEEKDAYS.vi,
};

/** "October 2026" / "Tháng 10, 2026"; the year is optional. */
export function monthTitle(
  month: string,
  lang: Lang,
  withYear: boolean
): string {
  const [y, m] = month.split("-");
  if (lang === "vi") {
    return withYear ? `Tháng ${Number(m)}, ${y}` : `Tháng ${Number(m)}`;
  }
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function editionsLabel(n: number, lang: Lang): string {
  if (lang === "vi") return `${n} số`;
  return n === 1 ? "1 edition" : `${n} editions`;
}
