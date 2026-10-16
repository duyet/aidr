import { createFileRoute, useLocation } from "@tanstack/react-router";
import { NotFoundPage } from "../components/NotFoundPage";
import { WeeklyPaper, weeklyTitle } from "../components/WeeklyPaper";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import { absoluteSiteUrl } from "../lib/locale-url";
import { notFoundCopy } from "../lib/not-found";
import { NOT_FOUND_HEADER } from "../lib/not-found-status";
import { localizedPageHead, notFoundHead } from "../lib/seo";
import { resizeCdnImageUrl } from "../lib/tldr-images";
import type { Lang } from "../lib/types";
import {
  formatWeekRange,
  weekCacheControl,
  weekMarkdownPath,
  weekPath,
} from "../lib/week";
import { fetchWeekEdition } from "../lib/week-fn";
import {
  isWeekEmptyIn,
  type WeekEdition,
  weekIntro,
  weekStoriesFor,
} from "../lib/week-model";

type LoaderResult =
  | { kind: "week"; edition: WeekEdition }
  | { kind: "missing"; lang: Lang };

function otherLang(lang: Lang): Lang {
  return lang === "vi" ? "en" : "vi";
}

/** og/twitter description: the intro in this language, else a plain line. */
function weekDescription(edition: WeekEdition, lang: Lang): string {
  const intro = weekIntro(edition, lang);
  if (intro) return intro.length > 200 ? `${intro.slice(0, 199)}…` : intro;
  const count = weekStoriesFor(edition, lang).length;
  const range = formatWeekRange(edition.start_date, edition.end_date, lang);
  return lang === "vi"
    ? `${count} tin AI đáng đọc nhất tuần ${range}.`
    : `The ${count} AI stories that mattered in the week of ${range}.`;
}

export const Route = createFileRoute("/week/$week")({
  loader: async ({ params, context }): Promise<LoaderResult> => {
    const edition = await fetchWeekEdition({ data: { week: params.week } });
    // A language with no stories 404s; the other language is not shown.
    if (!edition || isWeekEmptyIn(edition, context.lang)) {
      return { kind: "missing", lang: context.lang };
    }
    return { kind: "week", edition };
  },
  headers: ({ loaderData, match }): Record<string, string> => {
    // No loaderData: the loader threw and Start answers 500. Not a 404.
    if (!loaderData) {
      return {
        "Cache-Control": "private, no-store",
        "Content-Language": match.context.lang,
        Vary: "Cookie, Accept-Language",
      };
    }
    if (loaderData.kind === "missing") {
      return {
        [NOT_FOUND_HEADER]: "1",
        "Cache-Control": "private, no-store",
        "Content-Language": match.context.lang,
        Vary: "Cookie, Accept-Language",
      };
    }
    // Same rule as the day archive: only an explicit `?lang=` response is
    // shareable; a cookie/Accept-Language pick stays private.
    const explicitLocale =
      match.search.lang !== undefined && match.search.locale === undefined;
    return {
      "Cache-Control": explicitLocale
        ? weekCacheControl(loaderData.edition.week, Date.now())
        : "private, no-store",
      "Content-Language": match.context.lang,
      ...(explicitLocale ? {} : { Vary: "Cookie, Accept-Language" }),
    };
  },
  head: ({ loaderData, match }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: weekErrorCopy(match.context.lang).title },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    if (loaderData.kind === "missing") {
      return notFoundHead(notFoundCopy(loaderData.lang).documentTitle);
    }
    const lang = match.context.lang;
    const { edition } = loaderData;
    const range = formatWeekRange(edition.start_date, edition.end_date, lang);
    const lead = weekStoriesFor(edition, lang)[0];
    // The lead story's publisher image; never a generated card.
    const leadImage = resizeCdnImageUrl(lead?.item.image_url, "full");
    const head = localizedPageHead({
      path: weekPath(edition.week),
      title:
        lang === "vi"
          ? `${weeklyTitle(lang)} số ${edition.issue} · ${range}`
          : `${weeklyTitle(lang)} No. ${edition.issue} · ${range}`,
      description: weekDescription(edition, lang),
      ...(leadImage ? { imageUrl: leadImage } : {}),
      lang,
      route: headRouteInput(match),
    });
    return {
      ...head,
      // The site card size does not describe a publisher photo.
      meta: leadImage
        ? (head.meta ?? []).filter(
            (m) =>
              !("property" in m) ||
              (m.property !== "og:image:width" &&
                m.property !== "og:image:height")
          )
        : head.meta,
      links: [
        // A week with no stories in the other language 404s there, so it has
        // no translation to advertise.
        ...(head.links ?? []).filter(
          (link) => !link.hrefLang || !isWeekEmptyIn(edition, otherLang(lang))
        ),
        {
          rel: "alternate",
          type: "text/markdown",
          title: "Markdown",
          href: absoluteSiteUrl(weekMarkdownPath(edition.week), lang),
        },
      ],
    };
  },
  component: WeekPage,
  errorComponent: WeekErrorPage,
});

function weekErrorCopy(lang: Lang) {
  return lang === "vi"
    ? {
        title: "Không tải được bản tin tuần | AI;DR",
        body: "Không tải được bản tin tuần này. Vui lòng thử lại.",
        retry: "Thử lại",
      }
    : {
        title: "Weekly edition unavailable | AI;DR",
        body: "This weekly edition could not load. Please try again.",
        retry: "Try again",
      };
}

/** A failed D1 read, not a missing week: offer a reload of the same URL. */
function WeekErrorPage() {
  const lang = useLang();
  const href = useLocation({ select: (l) => l.href });
  const copy = weekErrorCopy(lang);
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        <a
          href={href}
          className="mt-6 inline-block text-sm underline underline-offset-4 decoration-accent hover:decoration-2"
        >
          {copy.retry}
        </a>
      </div>
    </div>
  );
}

function WeekPage() {
  const data = Route.useLoaderData();
  const lang = useLang();
  if (data.kind === "missing") return <NotFoundPage />;
  return <WeeklyPaper edition={data.edition} lang={lang} />;
}
