import { createFileRoute } from "@tanstack/react-router";
import { weeklyTitle } from "../components/WeeklyPaper";
import { WeeklySubscribeCta } from "../components/WeeklySubscribeCta";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import { localizedPageHead } from "../lib/seo";
import type { Lang } from "../lib/types";
import { formatWeekRange, WEEKS_INDEX_PATH, weekPath } from "../lib/week";
import { fetchWeekIndex } from "../lib/week-fn";
import type { WeekSummary } from "../lib/week-model";

const INDEX_CACHE_CONTROL =
  "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600";

export const Route = createFileRoute("/weeks")({
  loader: async () => ({ weeks: await fetchWeekIndex() }),
  headers: ({ match }): Record<string, string> => {
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
  head: ({ match }) => {
    const lang = match.context.lang;
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
    <div className="mx-auto max-w-3xl py-8">
      <header className="border-y-4 border-double border-foreground py-4 text-center">
        <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-6xl">
          {weeklyTitle(lang)}
        </h1>
        <p className="mt-2 font-serif italic text-muted-foreground">
          {vi ? "Lưu trữ các số báo" : "The archive"}
        </p>
      </header>
      <WeeklySubscribeCta lang={lang} />
      {weeks.length === 0 ? (
        <p className="py-12 text-center font-serif text-lg italic text-muted-foreground">
          {vi
            ? "Số đầu tiên sẽ ra sau khi tuần này kết thúc. Đăng ký ở trên để nhận ngay khi có."
            : "The first issue comes out once this week closes. Subscribe above to get it the moment it lands."}
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {weeks.map((week) => {
            const text = teaser(week, lang);
            return (
              <li key={week.week} className="py-5">
                <a
                  href={weekPath(week.week, lang)}
                  className="group block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
                >
                  <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {vi ? `Số ${week.issue}` : `Issue No. ${week.issue}`} ·{" "}
                    {week.week} · {storyCount(week.stories, vi)}
                  </p>
                  <h2 className="mt-1 font-serif text-2xl font-semibold group-hover:underline">
                    {formatWeekRange(week.start_date, week.end_date, lang)}
                  </h2>
                  {text ? (
                    <p className="mt-2 font-serif leading-relaxed text-foreground/80">
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
