import { Skeleton } from "@aidr/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { calendarPath, shiftMonth } from "../../lib/calendar";
import { latestArchiveDate } from "../../lib/day-archive";
import type { Lang } from "../../lib/types";
import { DayPreview } from "./DayPreview";
import { MonthGrid } from "./MonthGrid";
import { editionsLabel, monthTitle } from "./shared";
import { useCalendarMonth } from "./useCalendarMonth";

const NAV =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40";

/**
 * Month navigator, grid and "all editions" link. Mounted only while the
 * popover or sheet is open, so the first fetch happens on first open. The
 * popover opens days directly; the sheet selects on tap and previews the day.
 */
export function CalendarPanel({
  lang,
  surface,
}: {
  lang: Lang;
  surface: "popover" | "sheet";
}) {
  const vi = lang === "vi";
  const sheet = surface === "sheet";
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const state = useCalendarMonth(month);
  const cal = state.status === "ready" ? state.cal : null;
  const preview = sheet
    ? (cal?.days.find((d) => d.date === selected) ?? cal?.days.at(-1))
    : undefined;
  const prev = cal ? shiftMonth(cal.month, -1) : null;
  const next = cal ? shiftMonth(cal.month, 1) : null;
  const hasPrev =
    cal !== null &&
    cal.firstMonth !== null &&
    prev !== null &&
    prev >= cal.firstMonth;
  const hasNext = cal !== null && next !== null && next <= cal.lastMonth;
  const today = latestArchiveDate(Date.now());

  const title = (
    <p className="font-serif text-xl font-medium leading-tight">
      {cal
        ? monthTitle(
            cal.month,
            lang,
            !sheet || cal.month.slice(0, 4) !== today.slice(0, 4)
          )
        : " "}
    </p>
  );
  const prevBtn = (
    <button
      type="button"
      className={NAV}
      disabled={!hasPrev}
      onClick={() => prev && setMonth(prev)}
      aria-label={vi ? "Tháng trước" : "Previous month"}
    >
      <ChevronLeft className="size-4" aria-hidden />
    </button>
  );
  const nextBtn = (
    <button
      type="button"
      className={NAV}
      disabled={!hasNext}
      onClick={() => next && setMonth(next)}
      aria-label={vi ? "Tháng sau" : "Next month"}
    >
      <ChevronRight className="size-4" aria-hidden />
    </button>
  );
  const allEditions = (
    <a
      href={calendarPath(cal?.month ?? month, lang)}
      className="text-sm font-bold underline-offset-2 hover:underline"
    >
      {sheet
        ? vi
          ? "Tất cả số báo →"
          : "All editions →"
        : vi
          ? "Xem tất cả số báo →"
          : "See all editions →"}
    </a>
  );

  return (
    <div>
      {sheet ? (
        <>
          <div
            className="mx-auto mb-3 h-1 w-9 rounded-full bg-muted"
            aria-hidden
          />
          <div className="mb-3 flex items-center gap-2">
            {prevBtn}
            <div className="min-w-0 flex-1">{title}</div>
            {nextBtn}
            <span className="pl-2">{allEditions}</span>
          </div>
        </>
      ) : (
        <div className="mb-3 flex items-center gap-1.5">
          <div className="flex-1">{title}</div>
          {prevBtn}
          {nextBtn}
        </div>
      )}

      {cal ? (
        <MonthGrid
          cal={cal}
          lang={lang}
          today={today}
          selected={preview?.date}
          onSelect={sheet ? setSelected : undefined}
          size={sheet ? "lg" : "sm"}
        />
      ) : state.status === "error" ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {vi ? "Không tải được lịch." : "The calendar could not be loaded."}
        </p>
      ) : (
        <div
          className="grid grid-cols-7 gap-1"
          role="status"
          aria-label={vi ? "Đang tải lịch" : "Loading calendar"}
        >
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton
              key={i}
              className="aspect-square rounded-[10px] bg-muted/50"
            />
          ))}
        </div>
      )}

      {preview ? <DayPreview day={preview} lang={lang} /> : null}

      {sheet ? null : (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {cal ? editionsLabel(cal.days.length, lang) : null}
          </span>
          {allEditions}
        </div>
      )}
    </div>
  );
}
