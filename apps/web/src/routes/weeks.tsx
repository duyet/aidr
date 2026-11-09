import { createFileRoute } from "@tanstack/react-router";
import { LoadErrorPage } from "../components/LoadErrorPage";
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

function WeeksPage() {
  const { weeks } = Route.useLoaderData();
  const lang = useLang();
  const vi = lang === "vi";
  return (
    <div className="mx-auto max-w-3xl pt-5 pb-10 max-sm:pt-4">
      <header>
        <p className={EYEBROW}>{vi ? "Lưu trữ các số báo" : "The archive"}</p>
        <h1 className={`mt-2 ${PAGE_TITLE}`}>{weeklyTitle(lang)}</h1>
      </header>
      <WeeklySubscribeCta lang={lang} />
      {weeks.length === 0 ? (
        <p className="border-t border-border py-10 text-center text-[calc(15px*var(--reader-font-size,1))] text-muted-foreground">
          {vi
            ? "Số đầu tiên sẽ ra sau khi tuần này kết thúc. Đăng ký ở trên để nhận ngay khi có."
            : "The first issue comes out once this week closes. Subscribe above to get it the moment it lands."}
        </p>
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {weeks.map((week) => {
            const text = teaser(week, lang);
            return (
              <li key={week.week}>
                <a
                  href={weekPath(week.week, lang)}
                  className="group -mx-2 block rounded-[6px] px-2 py-3.5 hover:bg-muted/60"
                >
                  <p className={`${EYEBROW} tabular-nums`}>
                    {vi ? `Số ${week.issue}` : `Issue No. ${week.issue}`} ·{" "}
                    {week.week} · {storyCount(week.stories, vi)}
                  </p>
                  <h2 className="mt-1 text-[calc(17px*var(--reader-font-size,1))] font-semibold leading-[1.35] tracking-[-0.01em] text-foreground group-hover:text-accent">
                    {formatWeekRange(week.start_date, week.end_date, lang)}
                  </h2>
                  {text ? (
                    <p className="mt-1 text-[calc(14px*var(--reader-font-size,1))] leading-(--reader-leading,1.55) text-body">
                      {text}
                    </p>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
