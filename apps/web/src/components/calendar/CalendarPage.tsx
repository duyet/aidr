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
import { Bi } from "../Bi";
import { DayCard } from "./DayCard";
import { MonthAgenda } from "./MonthAgenda";
import { MonthGrid } from "./MonthGrid";
import { HEADER_HEAT_CLASS, monthTitle } from "./shared";

const ROUND = "btn-soft !size-8 !p-0 shrink-0 max-sm:!size-11";
const ROUND_LINK = ROUND;
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
    <div className="mx-auto max-w-5xl pt-5 pb-10 max-sm:pt-4">
      <div className="grid gap-6 min-[860px]:grid-cols-[minmax(0,1fr)_20rem] min-[860px]:items-start">
        <section aria-labelledby="calendar-month">
          <header className="mb-4 flex items-center gap-2">
            <h1
              id="calendar-month"
              className="flex-1 text-[24px] font-medium leading-[1.18] tracking-[-0.025em] text-foreground min-[820px]:text-[34px] min-[820px]:leading-[1.12]"
            >
              {monthTitle(month, lang, true)}
            </h1>
            {onCurrentMonth ? (
              <span aria-disabled="true" className="btn-soft max-sm:!h-11">
                <Bi inline vi="Hôm nay" en="Today" />
              </span>
            ) : (
              <a
                href={calendarPath(cal.lastMonth, lang)}
                className="btn-soft max-sm:!h-11"
              >
                <Bi inline vi="Hôm nay" en="Today" />
              </a>
            )}
            {hasPrev ? (
              <a
                href={calendarPath(prev, lang)}
                className={ROUND_LINK}
                aria-label={vi ? "Tháng trước" : "Previous month"}
              >
                <ChevronLeft aria-hidden />
              </a>
            ) : (
              <span className={ROUND_OFF} aria-hidden>
                <ChevronLeft />
              </span>
            )}
            {hasNext ? (
              <a
                href={calendarPath(next, lang)}
                className={ROUND_LINK}
                aria-label={vi ? "Tháng sau" : "Next month"}
              >
                <ChevronRight aria-hidden />
              </a>
            ) : (
              <span className={ROUND_OFF} aria-hidden>
                <ChevronRight />
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
                className="inline-block size-3 rounded-sm bg-muted"
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
              <Bi
                as="h2"
                className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground"
                vi="Bản tin tuần"
                en="Weekly editions"
              />
              <ul className="flex flex-wrap gap-2">
                {weeks.map((week) => {
                  const b = weekBounds(week);
                  return (
                    <li key={week}>
                      <a
                        href={weekPath(week, lang)}
                        className="chip tabular-nums"
                      >
                        <span className="font-mono text-[11px] font-medium text-accent">
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
