import { EYEBROW } from "../lib/page-style";
import type { Lang } from "../lib/types";
import { formatWeekRange, weekPath } from "../lib/week";
import type { OpenWeekSummary } from "../lib/week-model";
import { ShareWeekButton } from "./ShareWeekButton";
import { weeklyTitle } from "./WeeklyPaper";
import { WeekThumb } from "./WeekThumb";

/**
 * The in-progress week in the `/weeks` archive list: same row shape as a
 * published issue, a pulsing "In progress" marker instead of a static
 * issue pill, linked to the live, provisional `/week/<week>` edition. It
 * re-ranks on every visit; the permanent edition appears once the week
 * closes.
 */
export function OpenWeekRow({
  open,
  lang,
}: {
  open: OpenWeekSummary;
  lang: Lang;
}) {
  const vi = lang === "vi";
  const range = formatWeekRange(open.start_date, open.end_date, lang);
  return (
    <li className="px-2 py-3.5">
      <div className="group flex items-start gap-4">
        <WeekThumb week={open} />
        <div className="min-w-0 flex-1">
          <a
            href={weekPath(open.week, lang)}
            className="block"
            aria-label={
              vi
                ? `${weeklyTitle(lang)} tuần này, đang diễn ra, ${range}`
                : `${weeklyTitle(lang)} this week, in progress, ${range}`
            }
          >
            <p className={`${EYEBROW} tabular-nums`}>
              <span className="inline-flex items-center gap-1.5 font-sans text-[calc(11px*var(--reader-font-size,1))] font-bold uppercase tracking-[0.08em] text-foreground">
                <span
                  className="size-1.5 animate-pulse rounded-full bg-signal motion-reduce:animate-none"
                  aria-hidden
                />
                {vi ? "Đang diễn ra" : "In progress"}
              </span>{" "}
              · {open.week} ·{" "}
              {vi
                ? `${open.stories} tin đến hiện tại`
                : `${open.stories} stories so far`}
            </p>
            <h2 className="mt-1 text-[calc(17px*var(--reader-font-size,1))] leading-[1.35] font-semibold tracking-[-0.01em] text-foreground transition-colors group-hover:text-accent">
              {range}
            </h2>
            <p className="mt-1 text-[calc(14px*var(--reader-font-size,1))] leading-[1.55] text-body">
              {vi
                ? `${open.stories} tin đang dẫn đầu tuần — bảng xếp hạng cập nhật theo từng ngày, số chính thức ra vào thứ Hai.`
                : `The ${open.stories} stories leading this week so far — re-ranked daily, the full edition lands on Monday.`}
            </p>
          </a>
          <div className="mt-2">
            <ShareWeekButton week={open} lang={lang} />
          </div>
        </div>
      </div>
    </li>
  );
}
