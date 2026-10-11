import { type CalendarMonth, heatLevel, monthCells } from "../../lib/calendar";
import { dayArchivePath } from "../../lib/day-archive";
import type { Lang } from "../../lib/types";
import {
  dayTitle,
  formatDay,
  HEADER_HEAT_CLASS,
  storiesLabel,
  WEEKDAY_INITIALS,
} from "./shared";

const TILE =
  "relative flex aspect-square items-center justify-center rounded-[10px] tabular-nums";
const RING = " ring-2 ring-foreground";
const DOT =
  "absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current";

/**
 * Month heat grid for the header popover and sheet. Edition days link to
 * their day archive, or in the sheet are buttons that select the day for the
 * preview. Days without an edition are plain numbers. The ring marks the
 * selected day, or today where nothing is selectable; the sheet marks today
 * with a dot instead.
 */
export function MonthGrid({
  cal,
  lang,
  today,
  selected,
  onSelect,
  size = "sm",
}: {
  cal: CalendarMonth;
  lang: Lang;
  /** Audience-zone `YYYY-MM-DD` of today. */
  today: string;
  selected?: string;
  /** Present in the sheet: days select instead of navigating. */
  onSelect?: (date: string) => void;
  size?: "sm" | "lg";
}) {
  const byDate = new Map(cal.days.map((d) => [d.date, d]));
  const max = Math.max(0, ...cal.days.map((d) => d.count));
  const text = size === "lg" ? "text-base" : "text-xs";

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden>
        {WEEKDAY_INITIALS[lang].map((w, i) => (
          <span
            key={i}
            className="text-center font-mono text-[11px] text-muted-foreground"
          >
            {w}
          </span>
        ))}
      </div>
      <ol className={`grid grid-cols-7 ${size === "lg" ? "gap-1.5" : "gap-1"}`}>
        {monthCells(cal.month).map((date, i) => {
          if (!date) return <li key={`pad-${i}`} aria-hidden />;
          const num = Number(date.slice(8));
          const isToday = date === today;
          const current = isToday ? "date" : undefined;
          const ring = (onSelect ? date === selected : isToday) ? RING : "";
          const dot =
            onSelect && isToday ? <span className={DOT} aria-hidden /> : null;
          const day = byDate.get(date);
          if (!day) {
            return (
              <li key={date}>
                <span
                  aria-current={current}
                  className={`${TILE} ${text} text-muted-foreground${ring}`}
                >
                  {num}
                  {dot}
                </span>
              </li>
            );
          }
          const title = dayTitle(day, lang);
          const label = `${formatDay(date, lang, "long")}: ${storiesLabel(day.count, lang)}${title ? `. ${title}` : ""}`;
          const className = `${TILE} ${text} font-medium transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${HEADER_HEAT_CLASS[heatLevel(day.count, max)]}${ring}`;
          return (
            <li key={date}>
              {onSelect ? (
                <button
                  type="button"
                  aria-pressed={date === selected}
                  aria-current={current}
                  aria-label={label}
                  onClick={() => onSelect(date)}
                  className={`${className} w-full`}
                >
                  {num}
                  {dot}
                </button>
              ) : (
                <a
                  href={dayArchivePath(date, lang)}
                  aria-current={current}
                  aria-label={label}
                  className={className}
                >
                  {num}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
