import type { CalendarDay } from "../../lib/calendar";
import { dayArchivePath } from "../../lib/day-archive";
import type { Lang } from "../../lib/types";
import { HighlightedText } from "../HighlightedText";
import { dayTitle, storiesLabel, weekdayShort } from "./shared";

/**
 * The month's editions, newest first: serif day number over a mono weekday,
 * the lead headline, the story count, and a thumbnail on the right.
 */
export function MonthAgenda({
  days,
  lang,
}: {
  days: CalendarDay[];
  lang: Lang;
}) {
  const vi = lang === "vi";
  if (days.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        {vi ? "Tháng này chưa có tin nào." : "No stories this month yet."}
      </p>
    );
  }
  return (
    <ol className="divide-y divide-border border-t border-border">
      {[...days].reverse().map((day) => {
        const title = dayTitle(day, lang);
        return (
          <li key={day.date}>
            <a
              href={dayArchivePath(day.date, lang)}
              className="group grid grid-cols-[3rem_1fr_auto] items-start gap-3.5"
              style={{
                paddingTop: "var(--reader-pad, 0.75rem)",
                paddingBottom: "var(--reader-pad, 0.75rem)",
              }}
            >
              <span className="pt-0.5 text-center">
                <span className="block font-serif text-3xl leading-none tabular-nums">
                  {Number(day.date.slice(8))}
                </span>
                <span className="font-mono text-[11px] uppercase text-muted-foreground">
                  {weekdayShort(day.date, lang)}
                </span>
              </span>
              <span className="min-w-0">
                <span className="line-clamp-3 font-semibold leading-snug group-hover:underline group-hover:underline-offset-2">
                  {title ? (
                    <HighlightedText text={title} tags={day.tags} />
                  ) : vi ? (
                    "Xem các tin trong ngày"
                  ) : (
                    "See the day's stories"
                  )}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {storiesLabel(day.count, lang)}
                </span>
              </span>
              {day.image_url ? (
                <img
                  src={day.image_url}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="aspect-[4/3] w-[72px] rounded-[10px] bg-muted object-cover"
                />
              ) : (
                <span className="w-[72px]" aria-hidden />
              )}
            </a>
          </li>
        );
      })}
    </ol>
  );
}
