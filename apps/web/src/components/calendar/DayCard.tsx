import type { CalendarDay } from "../../lib/calendar";
import { dayArchivePath } from "../../lib/day-archive";
import { categoryLabel } from "../../lib/lang";
import type { Lang } from "../../lib/types";
import {
  BLANK_IF_BROKEN,
  dayTitle,
  formatDay,
  runnerTitles,
  storiesLabel,
} from "./shared";

/**
 * Desktop preview of one edition day: lead image, mono eyebrow, serif
 * headline, runner-ups, category chips and the link to the day archive.
 * Runner-ups and chips appear only when the day has them.
 */
export function DayCard({ day, lang }: { day: CalendarDay; lang: Lang }) {
  const vi = lang === "vi";
  const title = dayTitle(day, lang);
  const runners = runnerTitles(day, lang);
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-background">
      {day.image_url ? (
        <img
          key={day.image_url}
          src={day.image_url}
          alt=""
          width={640}
          height={360}
          loading="lazy"
          referrerPolicy="no-referrer"
          {...BLANK_IF_BROKEN}
          className="aspect-video w-full bg-muted object-cover"
        />
      ) : null}
      <div className="grid gap-2 p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {formatDay(day.date, lang, "long")} · {storiesLabel(day.count, lang)}
        </p>
        <h2 className="font-serif text-xl font-medium leading-tight">
          {title ?? (vi ? "Xem các tin trong ngày" : "See the day's stories")}
        </h2>
        {runners.length > 0 ? (
          <ul className="grid list-disc gap-1 pl-4 text-sm leading-snug text-muted-foreground">
            {runners.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ) : null}
        {day.categories.length > 0 ? (
          <ul
            className="flex flex-wrap gap-1.5"
            aria-label={vi ? "Chủ đề" : "Topics"}
          >
            {day.categories.map((c) => (
              <li
                key={c}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {categoryLabel(c, lang)}
              </li>
            ))}
          </ul>
        ) : null}
        <a
          href={dayArchivePath(day.date, lang)}
          className="mt-1 justify-self-start rounded-full bg-foreground px-3.5 py-1.5 text-sm font-semibold text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {vi ? "Mở số báo →" : "Open edition →"}
        </a>
      </div>
    </article>
  );
}
