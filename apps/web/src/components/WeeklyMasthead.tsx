import { EYEBROW, PAGE_TITLE } from "../lib/page-style";
import type { Lang } from "../lib/types";
import { formatWeekRange, weekPath } from "../lib/week";
import type { WeekSummary } from "../lib/week-model";
import { weeklyTitle } from "./WeeklyPaper";
import { WeeklySubscribeBlock } from "./WeeklySubscribeCta";

/**
 * The archive index masthead and the weekly-email subscribe row as one
 * card: the latest issue's number, date range, the page title linked to
 * that issue, and the subscribe action on the same card. Previously two
 * stacked components on `/weeks`.
 */
export function WeeklyMasthead({
  latest,
  lang,
}: {
  /** The newest published issue, or null before the first one lands. */
  latest: WeekSummary | null;
  lang: Lang;
}) {
  const vi = lang === "vi";
  const title = weeklyTitle(lang);
  const href = latest ? weekPath(latest.week, lang) : undefined;
  return (
    <header className="rounded-2xl border border-border bg-card">
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <p className={`${EYEBROW} flex flex-wrap items-center gap-x-3 gap-y-1`}>
          {latest ? (
            <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 font-sans text-[calc(11px*var(--reader-font-size,1))] font-bold uppercase tracking-[0.08em] text-accent-foreground">
              {vi ? `Số ${latest.issue}` : `Issue No. ${latest.issue}`}
            </span>
          ) : null}
          <span className="tabular-nums">
            {latest
              ? formatWeekRange(latest.start_date, latest.end_date, lang)
              : vi
                ? "Lưu trữ các số báo"
                : "The archive"}
          </span>
        </p>
        <h1
          className={`mt-2.5 ${PAGE_TITLE} text-[calc(28px*var(--reader-font-size,1))] min-[820px]:text-[calc(40px*var(--reader-font-size,1))]`}
        >
          {href ? (
            <a
              href={href}
              className="rounded-sm transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
            >
              {title}
            </a>
          ) : (
            title
          )}
        </h1>
        <p className="mt-1.5 text-[calc(15px*var(--reader-font-size,1))] leading-[1.6] text-muted-foreground">
          {vi
            ? "Những tin AI đáng đọc nhất, mỗi tuần một số. Chia sẻ số bạn thích."
            : "The AI stories that mattered, one issue a week. Share the issue you liked."}
        </p>
      </div>
      <div className="border-t border-border px-5 py-5 sm:px-6">
        <WeeklySubscribeBlock lang={lang} />
      </div>
    </header>
  );
}
