import { createFileRoute } from "@tanstack/react-router";
import { LoadErrorPage } from "../components/LoadErrorPage";
import { weeklyTitle } from "../components/WeeklyPaper";
import { WeeklySubscribeCta } from "../components/WeeklySubscribeCta";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import { loadErrorHead, loadErrorHeaders } from "../lib/load-error";
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

/** The intro in this language only, cut at a word so a teaser never ends
 * mid-word; a week without one shows no teaser. */
function teaser(week: WeekSummary, lang: Lang, max: number): string | null {
  const intro = lang === "vi" ? week.intro_vi : week.intro_en;
  if (!intro) return null;
  if (intro.length <= max) return intro;
  const cut = intro.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

export function storyCount(n: number, vi: boolean): string {
  if (vi) return `${n} tin`;
  return n === 1 ? "1 story" : `${n} stories`;
}

function issueCount(n: number, vi: boolean): string {
  if (vi) return `${n} số`;
  return n === 1 ? "1 issue" : `${n} issues`;
}

function Kicker({ week, vi }: { week: WeekSummary; vi: boolean }) {
  return (
    <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      <span className="text-foreground">
        {vi ? `Số ${week.issue}` : `Issue No. ${week.issue}`}
      </span>{" "}
      · {week.week} · {storyCount(week.stories, vi)}
    </p>
  );
}

const ISSUE_LINK =
  "group block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground";

function LeadIssue({ week, lang }: { week: WeekSummary; lang: Lang }) {
  const vi = lang === "vi";
  const text = teaser(week, lang, 600);
  return (
    <article className="border-b-2 border-foreground pb-6">
      <a href={weekPath(week.week, lang)} className={ISSUE_LINK}>
        <Kicker week={week} vi={vi} />
        <h2 className="mt-2 font-serif text-4xl font-bold leading-[1.1] tracking-tight group-hover:underline sm:text-5xl">
          {formatWeekRange(week.start_date, week.end_date, lang)}
        </h2>
        {text ? (
          <p className="mt-4 font-serif text-lg leading-relaxed text-foreground/85 first-letter:float-left first-letter:mr-2 first-letter:text-6xl first-letter:font-bold first-letter:leading-[0.9] sm:columns-2 sm:gap-8 [column-rule:1px_solid_var(--color-border)]">
            {text}
          </p>
        ) : null}
        <p className="mt-4 font-sans text-sm font-semibold">
          {vi ? "Đọc số này →" : "Read this issue →"}
        </p>
      </a>
    </article>
  );
}

function ColumnIssue({ week, lang }: { week: WeekSummary; lang: Lang }) {
  const vi = lang === "vi";
  const text = teaser(week, lang, 260);
  return (
    <article className="mb-6 break-inside-avoid border-b border-border pb-5">
      <a href={weekPath(week.week, lang)} className={ISSUE_LINK}>
        <Kicker week={week} vi={vi} />
        <h3 className="mt-1.5 font-serif text-2xl font-semibold leading-snug group-hover:underline">
          {formatWeekRange(week.start_date, week.end_date, lang)}
        </h3>
        {text ? (
          <p className="mt-2 font-serif leading-relaxed text-foreground/80">
            {text}
          </p>
        ) : null}
      </a>
    </article>
  );
}

function WeeksPage() {
  const { weeks } = Route.useLoaderData();
  const lang = useLang();
  const vi = lang === "vi";
  const [lead, ...rest] = weeks;
  return (
    <div className="newspaper mx-auto max-w-6xl py-8">
      <header className="border-y-4 border-double border-foreground py-4 text-center">
        <p className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <span>{vi ? "Lưu trữ" : "The archive"}</span>
          <span>{issueCount(weeks.length, vi)}</span>
          <span>{vi ? "Ra sáng thứ Hai" : "Out every Monday"}</span>
        </p>
        <h1 className="mt-3 font-serif text-5xl font-bold leading-[1.1] tracking-tight sm:text-7xl">
          {weeklyTitle(lang)}
        </h1>
        <p className="mt-2 font-serif text-base italic text-muted-foreground">
          {vi
            ? "Những tin AI đáng đọc nhất, mỗi tuần một số"
            : "The AI stories that mattered, one issue a week"}
        </p>
      </header>
      {lead ? (
        <div className="pt-6">
          <LeadIssue week={lead} lang={lang} />
          <WeeklySubscribeCta lang={lang} />
          {rest.length > 0 ? (
            <div className="gap-8 sm:columns-2 lg:columns-3 [column-rule:1px_solid_var(--color-border)]">
              {rest.map((week) => (
                <ColumnIssue key={week.week} week={week} lang={lang} />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <WeeklySubscribeCta lang={lang} />
          <p className="py-12 text-center font-serif text-lg italic text-muted-foreground">
            {vi
              ? "Số đầu tiên sẽ ra sau khi tuần này kết thúc. Đăng ký ở trên để nhận ngay khi có."
              : "The first issue comes out once this week closes. Subscribe above to get it the moment it lands."}
          </p>
        </>
      )}
    </div>
  );
}
