import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  type CalendarMonth,
  calendarPath,
  monthWeeks,
  shiftMonth,
} from "../../lib/calendar";
import type { Lang } from "../../lib/types";
import { formatWeekRange, weekBounds, weekPath } from "../../lib/week";
import { DayCard } from "./DayCard";
import { MonthAgenda } from "./MonthAgenda";
import { MonthGrid } from "./MonthGrid";
import { HEADER_HEAT_CLASS, monthTitle } from "./shared";

const ROUND =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border";
const ROUND_LINK = `${ROUND} transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`;
const ROUND_OFF = `${ROUND} pointer-events-none opacity-40`;

/**
 * The `/calendar` page body. Every link is a real href, so the grid, the
 * month arrows and the agenda all work without JS. On wide screens hovering
 * or focusing a tile previews that day in the sticky card, defaulting to the
 * latest edition; on phones the card is hidden and the agenda lists the
 * month under the grid. Both are always rendered and swapped by CSS, so the
 * server markup does not depend on the viewport.
 */
export function CalendarPage({
  cal,
  lang,
  today,
}: {
  cal: CalendarMonth;
  lang: Lang;
  /** Audience-zone `YYYY-MM-DD` of today. */
  today: string;
}) {
  const vi = lang === "vi";
  const [hovered, setHovered] = useState<string | undefined>(undefined);
  const { month } = cal;
  const preview = cal.days.find((d) => d.date === hovered) ?? cal.days.at(-1);
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const hasPrev = cal.firstMonth !== null && prev >= cal.firstMonth;
  const hasNext = next <= cal.lastMonth;
  const onCurrentMonth = month === cal.lastMonth;
  const max = Math.max(0, ...cal.days.map((d) => d.count));
  const weeks = monthWeeks(month, today);

  return (
    <div className="mx-auto max-w-5xl py-8">
      <div className="grid gap-6 min-[860px]:grid-cols-[minmax(0,1fr)_20rem] min-[860px]:items-start">
        <section aria-labelledby="calendar-month">
          <header className="mb-4 flex items-center gap-2">
            <h1
              id="calendar-month"
              className="flex-1 font-serif text-2xl font-medium tracking-tight sm:text-3xl"
            >
              {monthTitle(month, lang, true)}
            </h1>
            {onCurrentMonth ? (
              <span
                aria-disabled="true"
                className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold opacity-40"
              >
                {vi ? "Hôm nay" : "Today"}
              </span>
            ) : (
              <a
                href={calendarPath(cal.lastMonth, lang)}
                className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {vi ? "Hôm nay" : "Today"}
              </a>
            )}
            {hasPrev ? (
              <a
                href={calendarPath(prev, lang)}
                className={ROUND_LINK}
                aria-label={vi ? "Tháng trước" : "Previous month"}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </a>
            ) : (
              <span className={ROUND_OFF} aria-hidden>
                <ChevronLeft className="size-4" />
              </span>
            )}
            {hasNext ? (
              <a
                href={calendarPath(next, lang)}
                className={ROUND_LINK}
                aria-label={vi ? "Tháng sau" : "Next month"}
              >
                <ChevronRight className="size-4" aria-hidden />
              </a>
            ) : (
              <span className={ROUND_OFF} aria-hidden>
                <ChevronRight className="size-4" />
              </span>
            )}
          </header>

          <MonthGrid
            cal={cal}
            lang={lang}
            today={today}
            selected={preview?.date}
            onPreview={setHovered}
            size="xl"
          />

          <div
            data-testid="calendar-legend"
            className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
          >
            <span className="flex items-center gap-1">
              {vi ? "Ít" : "Fewer"}
              {HEADER_HEAT_CLASS.map((c, i) => (
                <i
                  key={i}
                  className={`inline-block size-3 rounded-sm ${c || "bg-muted/60"}`}
                  aria-hidden
                />
              ))}
              {vi ? "Nhiều tin" : "More stories"}
              {max > 0 ? (
                <span className="font-mono">
                  {vi ? ` (tối đa ${max})` : ` (up to ${max})`}
                </span>
              ) : null}
            </span>
            <span className="flex items-center gap-1">
              <i
                className="inline-block size-3 rounded-sm border border-dashed border-border"
                aria-hidden
              />
              {vi ? "Chưa có số báo" : "No edition"}
            </span>
            <span className="flex items-center gap-1">
              <i
                className="inline-block size-1.5 rounded-full bg-foreground"
                aria-hidden
              />
              {vi ? "Hôm nay" : "Today"}
            </span>
          </div>

          {weeks.length > 0 ? (
            <nav
              data-testid="calendar-weeks"
              aria-label={vi ? "Bản tin tuần" : "Weekly editions"}
              className="mt-5"
            >
              <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                {vi ? "Bản tin tuần" : "Weekly editions"}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {weeks.map((week) => {
                  const b = weekBounds(week);
                  return (
                    <li key={week}>
                      <a
                        href={weekPath(week, lang)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="font-mono text-xs font-semibold">
                          {week.slice(5)}
                        </span>
                        {b ? (
                          <span className="text-muted-foreground">
                            {formatWeekRange(b.start, b.end, lang)}
                          </span>
                        ) : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </section>

        {preview ? (
          <aside
            data-testid="calendar-preview"
            className="sticky top-20 hidden min-[860px]:block"
          >
            <DayCard day={preview} lang={lang} />
          </aside>
        ) : null}
      </div>

      <div
        data-testid="calendar-agenda"
        className={`mt-8${preview ? " min-[860px]:hidden" : ""}`}
      >
        <MonthAgenda days={cal.days} lang={lang} />
      </div>
    </div>
  );
}
