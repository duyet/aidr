import { type CalendarMonth, heatLevel, monthCells } from "../../lib/calendar";
import { dayArchivePath } from "../../lib/day-archive";
import type { Lang } from "../../lib/types";
import {
  dayTitle,
  HEADER_HEAT_CLASS,
  storiesLabel,
  WEEKDAY_INITIALS,
} from "./shared";

const TILE =
  "flex aspect-square items-center justify-center rounded-[10px] tabular-nums";
const RING = " ring-2 ring-foreground";

/**
 * Month heat grid for the header popover and sheet. Edition days link to
 * their day archive (or, on touch, select the day for the sheet's preview);
 * days without an edition are plain numbers.
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
  /** Present on touch: a tap selects the day instead of navigating. */
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
          const day = byDate.get(date);
          if (!day) {
            return (
              <li key={date}>
                <span
                  aria-current={current}
                  className={`${TILE} ${text} text-muted-foreground${isToday ? RING : ""}`}
                >
                  {num}
                </span>
              </li>
            );
          }
          const title = dayTitle(day, lang);
          const ring = isToday || date === selected ? RING : "";
          return (
            <li key={date}>
              <a
                href={dayArchivePath(date, lang)}
                title={title ?? undefined}
                aria-current={current}
                aria-label={`${date}: ${storiesLabel(day.count, lang)}${title ? `. ${title}` : ""}`}
                onClick={
                  onSelect
                    ? (e) => {
                        e.preventDefault();
                        onSelect(date);
                      }
                    : undefined
                }
                className={`${TILE} ${text} font-medium transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${HEADER_HEAT_CLASS[heatLevel(day.count, max)]}${ring}`}
              >
                {num}
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
