import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  dayTitle,
  HEAT_CLASS,
  storiesLabel,
  WEEKDAYS,
} from "../components/calendar/shared";
import { HighlightedText } from "../components/HighlightedText";
import {
  CALENDAR_PATH,
  calendarPath,
  firstWeekdayMon0,
  formatMonthHeading,
  heatLevel,
  monthCells,
  shiftMonth,
} from "../lib/calendar";
import { fetchCalendarMonth } from "../lib/calendar-fn";
import { dayArchivePath } from "../lib/day-archive";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import { localizedPageHead } from "../lib/seo";

export interface CalendarSearch {
  month?: string;
}

const CALENDAR_CACHE_CONTROL =
  "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600";

export const Route = createFileRoute("/calendar")({
  validateSearch: (search: Record<string, unknown>): CalendarSearch =>
    typeof search.month === "string" && search.month
      ? { month: search.month }
      : {},
  loaderDeps: ({ search }) => ({ month: search.month }),
  loader: async ({ deps }) => ({
    cal: await fetchCalendarMonth({ data: { month: deps.month } }),
  }),
  headers: ({ match }): Record<string, string> => {
    const explicitLocale =
      match.search.lang !== undefined && match.search.locale === undefined;
    return {
      "Cache-Control": explicitLocale
        ? CALENDAR_CACHE_CONTROL
        : "private, no-store",
      "Content-Language": match.context.lang,
      ...(explicitLocale ? {} : { Vary: "Cookie, Accept-Language" }),
    };
  },
  head: ({ match }) => {
    const lang = match.context.lang;
    return localizedPageHead({
      path: CALENDAR_PATH,
      title:
        lang === "vi"
          ? "Lịch các số báo | AI;DR"
          : "Calendar of past editions | AI;DR",
      description:
        lang === "vi"
          ? "Xem lại tin AI của bất kỳ ngày nào trên lịch của AI;DR."
          : "Browse the AI;DR daily editions by date: every day's top AI story on one calendar.",
      lang,
      route: headRouteInput(match),
    });
  },
  component: CalendarPage,
});

function CalendarPage() {
  const { cal } = Route.useLoaderData();
  const lang = useLang();
  const vi = lang === "vi";

  if (!cal) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        {vi ? "Không tải được lịch." : "The calendar could not be loaded."}
      </p>
    );
  }

  const { month } = cal;
  const byDate = new Map(cal.days.map((d) => [d.date, d]));
  const max = Math.max(0, ...cal.days.map((d) => d.count));
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const hasPrev = cal.firstMonth !== null && prev >= cal.firstMonth;
  const hasNext = next <= cal.lastMonth;
  const cells = monthCells(month);
  const agenda = [...cal.days].reverse();

  const navClass =
    "inline-flex size-9 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted";

  return (
    <div className="mx-auto max-w-3xl py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {vi ? "Các số đã phát hành" : "Past editions"}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <h1 className="flex-1 font-serif text-2xl font-medium tracking-tight sm:text-3xl">
            {formatMonthHeading(month, lang)}
          </h1>
          {hasPrev ? (
            <a
              href={calendarPath(prev, lang)}
              className={navClass}
              aria-label={vi ? "Tháng trước" : "Previous month"}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </a>
          ) : null}
          {hasNext ? (
            <a
              href={calendarPath(next, lang)}
              className={navClass}
              aria-label={vi ? "Tháng sau" : "Next month"}
            >
              <ChevronRight className="size-4" aria-hidden />
            </a>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" aria-hidden>
        {WEEKDAYS[lang].map((w) => (
          <span
            key={w}
            className="pb-1 text-center text-xs text-muted-foreground"
          >
            {w}
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((date, i) => {
          if (!date) return <li key={`pad-${i}`} aria-hidden />;
          const day = byDate.get(date);
          const num = Number(date.slice(8));
          if (!day) {
            return (
              <li
                key={date}
                className="flex aspect-square items-start rounded-lg border border-dashed border-border p-1.5 text-xs text-muted-foreground sm:text-sm"
              >
                {num}
              </li>
            );
          }
          const title = dayTitle(day, lang);
          return (
            <li key={date}>
              <a
                href={dayArchivePath(date, lang)}
                title={title ?? undefined}
                aria-label={`${date}: ${storiesLabel(day.count, lang)}${title ? `. ${title}` : ""}`}
                className={`flex aspect-square flex-col justify-between rounded-lg p-1.5 transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${HEAT_CLASS[heatLevel(day.count, max)]}`}
              >
                <span className="text-xs font-semibold tabular-nums sm:text-sm">
                  {num}
                </span>
                <span className="hidden text-xs tabular-nums opacity-75 sm:block">
                  {day.count}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        {vi ? "Ít" : "Fewer"}
        {HEAT_CLASS.map((c) => (
          <i key={c} className={`inline-block size-3 rounded-sm ${c}`} />
        ))}
        {vi ? "Nhiều tin hơn" : "More stories"}
      </div>

      {agenda.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          {vi ? "Tháng này chưa có tin nào." : "No stories this month yet."}
        </p>
      ) : (
        <ol className="mt-8 divide-y divide-border border-t border-border">
          {agenda.map((day) => {
            const title = dayTitle(day, lang);
            return (
              <li key={day.date}>
                <a
                  href={dayArchivePath(day.date, lang)}
                  className="group grid grid-cols-[3rem_1fr_auto] items-center gap-3"
                  style={{
                    paddingTop: "var(--reader-pad, 0.5rem)",
                    paddingBottom: "var(--reader-pad, 0.5rem)",
                  }}
                >
                  <span className="text-center">
                    <span className="block font-serif text-xl font-medium leading-none tabular-nums">
                      {Number(day.date.slice(8))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {
                        WEEKDAYS[lang][
                          (firstWeekdayMon0(month) +
                            Number(day.date.slice(8)) -
                            1) %
                            7
                        ]
                      }
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 leading-[calc(var(--reader-leading,1.55)_-_0.175)] group-hover:underline group-hover:underline-offset-2">
                      {title ? (
                        <HighlightedText text={title} tags={day.tags} />
                      ) : vi ? (
                        "Xem các tin trong ngày"
                      ) : (
                        "See the day's stories"
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {storiesLabel(day.count, lang)}
                    </span>
                  </span>
                  {day.image_url ? (
                    <img
                      src={day.image_url}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="aspect-[4/3] w-16 rounded-md bg-muted object-cover sm:w-24"
                    />
                  ) : (
                    <span />
                  )}
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
