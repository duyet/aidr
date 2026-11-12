import type { KeyboardEvent } from "react";
import {
  type CalendarMonth,
  heatLevel,
  monthCells,
  moveDay,
} from "../../lib/calendar";
import { dayArchivePath } from "../../lib/day-archive";
import type { Lang } from "../../lib/types";
import {
  formatWeekRange,
  isoWeekOfDate,
  weekBounds,
  weekIssue,
  weekPath,
} from "../../lib/week";
import {
  dayTitle,
  formatDay,
  HEADER_HEAT_CLASS,
  storiesLabel,
  WEEKDAY_INITIALS,
} from "./shared";

const ARROWS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);
const TILE =
  "relative flex aspect-square items-center justify-center rounded-[10px] tabular-nums";
const TILE_PAGE =
  "relative flex h-14 sm:h-16 flex-col justify-between rounded-xl p-1.5 text-left tabular-nums sm:p-2";
const RING = " ring-2 ring-foreground";
const DOT =
  "absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current";
const PAGE_DOT = "absolute right-1.5 top-1.5 size-1.5 rounded-full bg-current";

/**
 * Month heat grid for the header popover and sheet. Edition days link to
 * their day archive, or in the sheet are buttons that select the day for the
 * preview. Days without an edition are plain numbers. The ring marks the
 * selected day, or today where nothing is selectable; the sheet marks today
 * with a dot instead.
 *
 * The calendar page uses the `xl` size: tiles stay links and show the day's
 * story count, hover or focus reports the day through `onPreview`, the ring
 * follows `selected`, and today gets a dot. The `xl` grid is a leading `Wk`
 * column before Mon–Sun; a row whose week has a weekly edition links to it —
 * including the in-progress week, which opens the provisional ranking.
 * everything else stays a dashed, muted cell.
 */
export function MonthGrid({
  cal,
  lang,
  today,
  selected,
  onSelect,
  onPreview,
  size = "sm",
}: {
  cal: CalendarMonth;
  lang: Lang;
  /** Audience-zone `YYYY-MM-DD` of today. */
  today: string;
  selected?: string;
  /** Present in the sheet: days select instead of navigating. */
  onSelect?: (date: string) => void;
  /** Present on the page: hover or focus previews the day. */
  onPreview?: (date: string) => void;
  size?: "sm" | "lg" | "xl";
}) {
  const vi = lang === "vi";
  const byDate = new Map(cal.days.map((d) => [d.date, d]));
  const max = Math.max(0, ...cal.days.map((d) => d.count));
  const page = size === "xl";
  const picking = !!(onSelect || onPreview);
  const text = page
    ? "text-sm font-semibold"
    : size === "lg"
      ? "text-base"
      : "text-xs";
  const tile = page ? TILE_PAGE : TILE;
  const gap = page ? "gap-1 sm:gap-1.5" : size === "lg" ? "gap-1.5" : "gap-1";
  const gridCols = page
    ? "grid-cols-[3rem_repeat(7,minmax(0,1fr))]"
    : "grid-cols-7";

  // Complete weeks only: rows stay Mon–Sun, so each row maps to one ISO week.
  const rows = page
    ? (() => {
        const padded = [...monthCells(cal.month)];
        while (padded.length % 7 !== 0) padded.push(null);
        const rows: (string | null)[][] = [];
        for (let i = 0; i < padded.length; i += 7) {
          rows.push(padded.slice(i, i + 7));
        }
        return rows;
      })()
    : undefined;
  const currentWeek = page ? isoWeekOfDate(today) : null;

  const weekCell = (row: (string | null)[], rowIdx: number) => {
    const firstDay = row.find((d) => d !== null);
    if (!firstDay || !currentWeek)
      return <li key={`wk-${rowIdx}`} aria-hidden />;
    const week = isoWeekOfDate(firstDay);
    const bounds = weekBounds(week);
    const issue = weekIssue(week);
    // Closed weeks link to their stored edition; the in-progress week
    // links to the provisional ranking, which exists from the first story
    // on. Future weeks stay dashed and silent.
    const linked = issue !== null && bounds !== null && week <= currentWeek;
    if (linked) {
      const current = week === currentWeek;
      const label = current
        ? vi
          ? `Tuần này, đang diễn ra: ${formatWeekRange(bounds.start, bounds.end, lang)}`
          : `This week, in progress: ${formatWeekRange(bounds.start, bounds.end, lang)}`
        : vi
          ? `Bản tin tuần: Số ${issue}, ${formatWeekRange(bounds.start, bounds.end, lang)}`
          : `Weekly edition: No. ${issue}, ${formatWeekRange(bounds.start, bounds.end, lang)}`;
      return (
        <li key={`wk-${week}`}>
          <a
            href={weekPath(week, lang)}
            aria-label={label}
            className="flex h-14 sm:h-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-border font-mono transition-colors hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-[11px] leading-none font-semibold">
              {week.slice(5)}
            </span>
            <span className="text-[9px] leading-none text-accent">
              {vi ? `Số ${issue}` : `No. ${issue}`}
            </span>
          </a>
        </li>
      );
    }
    return (
      <li
        key={`wk-${week}`}
        aria-hidden
        className="flex h-14 sm:h-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border font-mono text-muted-foreground/60"
      >
        <span className="text-[11px] leading-none">{week.slice(5)}</span>
      </li>
    );
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLOListElement>) => {
    const from = (e.target as HTMLElement).dataset?.date;
    if (!from || !ARROWS.has(e.key)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const to = moveDay(
      cal.days.map((d) => d.date),
      from,
      e.key
    );
    e.preventDefault();
    e.currentTarget.querySelector<HTMLElement>(`[data-date="${to}"]`)?.focus();
  };

  const dayCell = (date: string | null, padKey: string) => {
    if (!date) return <li key={padKey} aria-hidden />;
    const num = Number(date.slice(8));
    const isToday = date === today;
    const current = isToday ? "date" : undefined;
    const ring = (picking ? date === selected : isToday) ? RING : "";
    const dot =
      picking && isToday ? (
        <span className={page ? PAGE_DOT : DOT} aria-hidden />
      ) : null;
    const day = byDate.get(date);
    if (!day) {
      return (
        <li key={date}>
          <span
            aria-current={current}
            className={`${tile} ${text} text-muted-foreground${page ? " border border-dashed border-border" : ""}${ring}`}
          >
            {num}
            {dot}
          </span>
        </li>
      );
    }
    const title = dayTitle(day, lang);
    const label = `${formatDay(date, lang, "long")}: ${storiesLabel(day.count, lang)}${title ? `. ${title}` : ""}`;
    const hover = page
      ? "hover:-translate-y-0.5 hover:shadow-md"
      : "hover:scale-105";
    const className = `${tile} ${text} font-medium transition-transform ${hover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${HEADER_HEAT_CLASS[heatLevel(day.count, max)]}${ring}`;
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
            data-date={date}
            tabIndex={page && date !== selected ? -1 : undefined}
            aria-current={current}
            aria-label={label}
            className={className}
            onPointerEnter={onPreview && (() => onPreview(date))}
            onFocus={onPreview && (() => onPreview(date))}
          >
            {num}
            {dot}
            {page ? (
              <span className="font-mono text-[9px] leading-none tracking-tight whitespace-nowrap opacity-75 max-[480px]:hidden">
                {storiesLabel(day.count, lang)}
              </span>
            ) : null}
          </a>
        )}
      </li>
    );
  };

  return (
    <div>
      <div className={`mb-1 grid ${gridCols} ${gap}`} aria-hidden>
        {page ? (
          <span className="text-center font-mono text-[calc(11px*var(--reader-font-size,1))] uppercase text-muted-foreground">
            {vi ? "Tuần" : "Wk"}
          </span>
        ) : null}
        {WEEKDAY_INITIALS[lang].map((w, i) => (
          <span
            key={i}
            className="text-center font-mono text-[calc(11px*var(--reader-font-size,1))] text-muted-foreground"
          >
            {w}
          </span>
        ))}
      </div>
      <ol
        className={`grid ${gridCols} ${gap}`}
        onKeyDown={page ? onGridKeyDown : undefined}
      >
        {rows
          ? rows.flatMap((row, rowIdx) => [
              weekCell(row, rowIdx),
              ...row.map((date, i) => dayCell(date, `pad-${rowIdx}-${i}`)),
            ])
          : monthCells(cal.month).map((date, i) => dayCell(date, `pad-${i}`))}
      </ol>
    </div>
  );
}
