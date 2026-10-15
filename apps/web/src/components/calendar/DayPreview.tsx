import type { CalendarDay } from "../../lib/calendar";
import { dayArchivePath } from "../../lib/day-archive";
import type { Lang } from "../../lib/types";
import { BLANK_IF_BROKEN, dayTitle, formatDay } from "./shared";

/**
 * Phone sheet preview of the selected day: thumbnail, date and story count,
 * the lead story's title. The whole row opens the day archive. The calendar
 * API carries only the lead story, so there are no runner-ups or categories.
 */
export function DayPreview({ day, lang }: { day: CalendarDay; lang: Lang }) {
  const title = dayTitle(day, lang);
  return (
    <a
      href={dayArchivePath(day.date, lang)}
      className="mt-4 flex items-center gap-3 rounded-2xl border border-border p-2.5 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {day.image_url ? (
        <img
          key={day.image_url}
          src={day.image_url}
          alt=""
          width={64}
          height={64}
          referrerPolicy="no-referrer"
          {...BLANK_IF_BROKEN}
          className="size-16 shrink-0 rounded-xl bg-muted object-cover"
        />
      ) : (
        <span className="size-16 shrink-0 rounded-xl bg-muted" aria-hidden />
      )}
      <span className="min-w-0">
        <span className="block font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {formatDay(day.date, lang, "short")} · {day.count}
        </span>
        <span className="mt-1 line-clamp-2 block font-semibold leading-snug">
          {title ??
            (lang === "vi"
              ? "Xem các tin trong ngày"
              : "See the day's stories")}
        </span>
      </span>
    </a>
  );
}
