import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage } from "../components/calendar/CalendarPage";
import { CALENDAR_PATH } from "../lib/calendar";
import { fetchCalendarMonth } from "../lib/calendar-fn";
import { latestArchiveDate } from "../lib/day-archive";
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
  component: CalendarRoute,
});

function CalendarRoute() {
  const { cal } = Route.useLoaderData();
  const lang = useLang();

  if (!cal) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        {lang === "vi"
          ? "Không tải được lịch."
          : "The calendar could not be loaded."}
      </p>
    );
  }

  return (
    <CalendarPage cal={cal} lang={lang} today={latestArchiveDate(Date.now())} />
  );
}
