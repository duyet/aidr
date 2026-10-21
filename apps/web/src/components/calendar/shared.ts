import type { SyntheticEvent } from "react";
import type { CalendarDay } from "../../lib/calendar";
import type { Lang } from "../../lib/types";

export const WEEKDAYS: Record<Lang, string[]> = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  vi: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
};

export function dayTitle(day: CalendarDay, lang: Lang): string | null {
  return lang === "vi" ? day.title_vi : day.title;
}

/** 1x1 transparent GIF: the image keeps its box and `bg-muted` fill. */
const BLANK_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function blank(img: HTMLImageElement): void {
  // srcset wins over src, and leaves the publisher URL in place.
  if (img.srcset !== BLANK_IMAGE) img.srcset = BLANK_IMAGE;
}

/**
 * Props for a publisher image that may be dead. A 404 otherwise paints the
 * broken-image icon; this points srcset at a blank pixel so the slot shows the
 * muted placeholder and nothing around it moves. A fast 404 lands before
 * hydration attaches `onError`, so the ref also checks on mount. Key the
 * image by its URL: a reused element would keep the blank srcset over the
 * next day's live image.
 */
export const BLANK_IF_BROKEN = {
  ref: (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) blank(img);
  },
  onError: (event: SyntheticEvent<HTMLImageElement>) =>
    blank(event.currentTarget),
};

export function storiesLabel(n: number, lang: Lang): string {
  if (lang === "vi") return `${n} tin`;
  return n === 1 ? "1 story" : `${n} stories`;
}

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

export function formatDay(
  date: string,
  lang: Lang,
  style: "short" | "long"
): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(
    lang === "vi" ? "vi-VN" : "en-US",
    { weekday: style, month: style, day: "numeric", timeZone: "UTC" }
  );
}

export function weekdayShort(date: string, lang: Lang): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return WEEKDAYS[lang][(dow + 6) % 7];
}

/**
 * Runner-up titles in the page language. Vietnamese shows only translated
 * titles, never the English one in their place.
 */
export function runnerTitles(day: CalendarDay, lang: Lang): string[] {
  return day.runners
    .map((r) => (lang === "vi" ? r.title_vi : r.title))
    .filter((t): t is string => !!t);
}

export function editionsLabel(n: number, lang: Lang): string {
  if (lang === "vi") return `${n} số`;
  return n === 1 ? "1 edition" : `${n} editions`;
}
