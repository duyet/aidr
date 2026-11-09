import { createFileRoute } from "@tanstack/react-router";
import { LoadErrorPage } from "../components/LoadErrorPage";
import { ShareWeekButton } from "../components/ShareWeekButton";
import { KeywordText } from "../components/story-page/KeywordText";
import { weeklyTitle } from "../components/WeeklyPaper";
import { WeeklySubscribeCta } from "../components/WeeklySubscribeCta";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import { loadErrorHead, loadErrorHeaders } from "../lib/load-error";
import { EYEBROW, PAGE_TITLE } from "../lib/page-style";
import { localizedPageHead } from "../lib/seo";
import type { Lang } from "../lib/types";
import { formatWeekRange, WEEKS_INDEX_PATH, weekPath } from "../lib/week";
import { fetchWeekIndex } from "../lib/week-fn";
import type { WeekSummary } from "../lib/week-model";

const INDEX_CACHE_CONTROL =
  "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600";

export const Route = createFileRoute("/weeks")({
  loader: async () => ({ weeks: await fetchWeekIndex() }),
  headers: ({ loaderData, match }): Record<string, string> => {
    // No loaderData: the read failed and Start answers 500. An empty index
    // here would be edge-cached as "no issues yet".
    if (!loaderData) return loadErrorHeaders(match.context.lang);
    const explicitLocale =
      match.search.lang !== undefined && match.search.locale === undefined;
    return {
      "Cache-Control": explicitLocale
        ? INDEX_CACHE_CONTROL
        : "private, no-store",
      "Content-Language": match.context.lang,
      ...(explicitLocale ? {} : { Vary: "Cookie, Accept-Language" }),
    };
  },
  head: ({ loaderData, match }) => {
    const lang = match.context.lang;
    if (!loaderData) return loadErrorHead("weeks", lang);
    return localizedPageHead({
      path: WEEKS_INDEX_PATH,
      title:
        lang === "vi"
          ? `${weeklyTitle(lang)}: tất cả các số | AI;DR`
          : `${weeklyTitle(lang)}: every issue | AI;DR`,
      description:
        lang === "vi"
          ? "Mỗi tuần, những tin AI đáng đọc nhất từ bản tin hằng ngày của AI;DR."
          : "Every week, the AI stories that mattered most, picked from the AI;DR daily editions.",
      lang,
      route: headRouteInput(match),
    });
  },
  component: WeeksPage,
  errorComponent: () => <LoadErrorPage subject="weeks" />,
});

/** The intro in this language only; a week without one shows no teaser. */
function teaser(week: WeekSummary, lang: Lang): string | null {
  const intro = lang === "vi" ? week.intro_vi : week.intro_en;
  if (!intro) return null;
  return intro.length > 220 ? `${intro.slice(0, 219)}…` : intro;
}

export function storyCount(n: number, vi: boolean): string {
  if (vi) return `${n} tin`;
  return n === 1 ? "1 story" : `${n} stories`;
}

/** Small cover chip on the left of each index row: the lead story's
 * publisher photo, or a week-number monogram when it has none. */
function WeekThumb({ week }: { week: WeekSummary }) {
  const label = `No. ${week.issue}`;
  if (week.image_url) {
    return (
      <span className="block h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:h-[84px] sm:w-[84px]">
        <img
          src={week.image_url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-gradient-to-br from-muted to-muted/40 text-accent sm:h-[84px] sm:w-[84px]"
    >
      <span className="font-mono text-[10px] leading-none font-semibold uppercase tracking-[0.12em]">
        {label}
      </span>
      <span className="mt-1 text-base leading-none font-bold tabular-nums">
        {week.week.slice(-2)}
      </span>
    </span>
  );
}

function WeeksPage() {
  const { weeks } = Route.useLoaderData();
  const lang = useLang();
  const vi = lang === "vi";
  return (
    <div className="mx-auto max-w-[860px] pt-5 pb-10 max-sm:pt-4">
      <header className="rounded-2xl border border-border bg-card px-5 py-5 sm:px-6">
        <p className={`${EYEBROW} flex flex-wrap items-center gap-x-3 gap-y-1`}>
          <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 font-sans text-[calc(11px*var(--reader-font-size,1))] font-bold uppercase tracking-[0.08em] text-accent-foreground">
            {vi
              ? `Số ${weeks[0]?.issue ?? ""}`
              : `Issue No. ${weeks[0]?.issue ?? ""}`}
          </span>
          <span className="tabular-nums">
            {weeks[0]
              ? formatWeekRange(weeks[0].start_date, weeks[0].end_date, lang)
              : vi
                ? "Lưu trữ các số báo"
                : "The archive"}
          </span>
        </p>
        <h1
          className={`mt-2.5 ${PAGE_TITLE} text-[calc(28px*var(--reader-font-size,1))] min-[820px]:text-[calc(40px*var(--reader-font-size,1))]`}
        >
          {weeklyTitle(lang)}
        </h1>
        <p className="mt-1.5 text-[calc(15px*var(--reader-font-size,1))] leading-[1.6] text-muted-foreground">
          {vi
            ? "Những tin AI đáng đọc nhất, mỗi tuần một số. Chia sẻ số bạn thích."
            : "The AI stories that mattered, one issue a week. Share the issue you liked."}
        </p>
      </header>
      <WeeklySubscribeCta lang={lang} />
      {weeks.length === 0 ? (
        <p className="border-t border-border py-10 text-center text-[calc(15px*var(--reader-font-size,1))] text-muted-foreground">
          {vi
            ? "Số đầu tiên sẽ ra sau khi tuần này kết thúc. Đăng ký ở trên để nhận ngay khi có."
            : "The first issue comes out once this week closes. Subscribe above to get it the moment it lands."}
        </p>
      ) : (
        <ol className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card px-2">
          {weeks.map((week) => {
            const text = teaser(week, lang);
            return (
              <li key={week.week} className="px-2 py-4">
                <div className="group flex items-start gap-4">
                  <WeekThumb week={week} />
                  <div className="min-w-0 flex-1">
                    <a
                      href={weekPath(week.week, lang)}
                      className="block"
                      aria-label={
                        vi
                          ? `${weeklyTitle(lang)} số ${week.issue}, ${formatWeekRange(week.start_date, week.end_date, lang)}`
                          : `${weeklyTitle(lang)} No. ${week.issue}, ${formatWeekRange(week.start_date, week.end_date, lang)}`
                      }
                    >
                      <p className={`${EYEBROW} tabular-nums`}>
                        <span className="font-semibold text-accent">
                          {vi ? `Số ${week.issue}` : `Issue No. ${week.issue}`}
                        </span>{" "}
                        · {week.week} · {storyCount(week.stories, vi)}
                      </p>
                      <h2 className="mt-1 text-[calc(17px*var(--reader-font-size,1))] leading-[1.35] font-semibold tracking-[-0.01em] text-foreground transition-colors group-hover:text-accent">
                        {formatWeekRange(week.start_date, week.end_date, lang)}
                      </h2>
                      {text ? (
                        <p className="mt-1 text-[calc(14px*var(--reader-font-size,1))] leading-[1.55] text-body">
                          <KeywordText text={text} tags={week.lead_tags} />
                        </p>
                      ) : null}
                    </a>
                    <div className="mt-2">
                      <ShareWeekButton week={week} lang={lang} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
