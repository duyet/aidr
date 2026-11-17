import { ArrowRight } from "lucide-react";
import type { CalendarDay } from "../../lib/calendar";
import { dayArchivePath } from "../../lib/day-archive";
import { categoryLabel } from "../../lib/lang";
import { topicStyle } from "../../lib/topic";
import type { Lang } from "../../lib/types";
import { Bi } from "../Bi";
import {
  BLANK_IF_BROKEN,
  dayTitle,
  formatDay,
  runnerTitles,
  storiesLabel,
} from "./shared";

export function DayCard({ day, lang }: { day: CalendarDay; lang: Lang }) {
  const vi = lang === "vi";
  const title = dayTitle(day, lang);
  const runners = runnerTitles(day, lang);
  return (
    <article className="overflow-hidden rounded-xl bg-muted">
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
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          {formatDay(day.date, lang, "long")} · {storiesLabel(day.count, lang)}
        </p>
        <h2 className="text-[18px] font-semibold leading-[1.3] tracking-[-0.015em] text-foreground">
          {title ?? (vi ? "Xem các tin trong ngày" : "See the day's stories")}
        </h2>
        {runners.length > 0 ? (
          <ul className="grid list-disc gap-1 pl-4 text-[14px] leading-[1.45] text-body marker:text-muted-foreground">
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
                className="rounded-full bg-background px-2.5 py-0.5 text-[12px] font-medium"
                style={topicStyle(c)}
              >
                <span className="topic-ink">{categoryLabel(c, lang)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <a
          href={dayArchivePath(day.date, lang)}
          className="btn-primary mt-1 justify-self-start"
        >
          <Bi inline vi="Mở số báo" en="Open edition" />
          <ArrowRight aria-hidden />
        </a>
      </div>
    </article>
  );
}
