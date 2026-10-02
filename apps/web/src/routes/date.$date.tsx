import { createFileRoute, Link } from "@tanstack/react-router";
import { DayBriefing } from "../components/DayBriefing";
import { DaySection } from "../components/DaySection";
import { DayVideo } from "../components/DayVideo";
import { NotFoundPage } from "../components/NotFoundPage";
import { TldrSection } from "../components/TldrSection";
import {
  dayArchiveCacheControl,
  dayArchiveMarkdownPath,
  dayArchivePath,
} from "../lib/day-archive";
import { fetchDayArchive } from "../lib/day-archive-fn";
import type { DayArchive } from "../lib/feed-queries";
import { headRouteInput } from "../lib/head-route";
import { formatDayHeading } from "../lib/lang";
import { useLang } from "../lib/lang-context";
import { absoluteSiteUrl } from "../lib/locale-url";
import { notFoundCopy } from "../lib/not-found";
import { NOT_FOUND_HEADER } from "../lib/not-found-status";
import { usePrefs } from "../lib/prefs";
import { localizedPageHead, notFoundHead } from "../lib/seo";
import { storyPath } from "../lib/slug";
import { displayTldrBullets } from "../lib/tldr-fallback";
import type { Lang } from "../lib/types";

type LoaderResult =
  | { kind: "day"; archive: DayArchive }
  | { kind: "missing"; lang: Lang };

/** Nothing to show: no stories and no digest stored for that date. */
function isEmptyArchive(archive: DayArchive): boolean {
  return !archive.day && !archive.tldr;
}

export const Route = createFileRoute("/date/$date")({
  loader: async ({ params, context }): Promise<LoaderResult> => {
    const archive = await fetchDayArchive({ data: { date: params.date } });
    if (!archive || isEmptyArchive(archive)) {
      return { kind: "missing", lang: context.lang };
    }
    return { kind: "day", archive };
  },
  headers: ({ loaderData, match }): Record<string, string> => {
    if (!loaderData || loaderData.kind === "missing") {
      return {
        [NOT_FOUND_HEADER]: "1",
        "Cache-Control": "private, no-store",
        "Content-Language": match.context.lang,
        Vary: "Cookie, Accept-Language",
      };
    }
    // Same rule as the story permalink: only an explicit `?lang=` response
    // is shareable; a cookie/Accept-Language pick stays private.
    const explicitLocale =
      match.search.lang !== undefined && match.search.locale === undefined;
    return {
      "Cache-Control": explicitLocale
        ? dayArchiveCacheControl(loaderData.archive.date, Date.now())
        : "private, no-store",
      "Content-Language": match.context.lang,
      ...(explicitLocale ? {} : { Vary: "Cookie, Accept-Language" }),
    };
  },
  head: ({ loaderData, match }) => {
    if (!loaderData || loaderData.kind === "missing") {
      const lang = loaderData?.kind === "missing" ? loaderData.lang : "vi";
      return notFoundHead(notFoundCopy(lang).documentTitle);
    }
    const lang = match.context.lang;
    const { archive } = loaderData;
    const heading = formatDayHeading(archive.date, lang);
    const count = archive.day?.items.length ?? 0;
    const head = localizedPageHead({
      path: dayArchivePath(archive.date),
      title:
        lang === "vi"
          ? `Tin AI ngày ${heading} | AI;DR`
          : `AI news for ${heading} | AI;DR`,
      description:
        lang === "vi"
          ? `AI;DR và ${count} tin AI được xếp hạng ngày ${heading}.`
          : `The AI;DR digest and ${count} ranked AI stories from ${heading}.`,
      lang,
      route: headRouteInput(match),
    });
    return {
      ...head,
      links: [
        ...(head.links ?? []),
        {
          rel: "alternate",
          type: "text/markdown",
          title: "Markdown",
          href: absoluteSiteUrl(dayArchiveMarkdownPath(archive.date), lang),
        },
      ],
    };
  },
  component: DayPage,
});

function DayNav({ archive, lang }: { archive: DayArchive; lang: Lang }) {
  const linkClass = "text-muted-foreground hover:text-accent";
  return (
    <nav
      aria-label={lang === "vi" ? "Chuyển ngày" : "Day navigation"}
      className="flex items-center justify-between gap-3 py-4 text-sm"
    >
      {archive.prevDate ? (
        <a href={dayArchivePath(archive.prevDate, lang)} className={linkClass}>
          ← {formatDayHeading(archive.prevDate, lang)}
        </a>
      ) : (
        <span />
      )}
      <Link to="/" search={{ lang }} className={linkClass}>
        {lang === "vi" ? "Bảng tin hôm nay" : "Live feed"}
      </Link>
      {archive.nextDate ? (
        <a href={dayArchivePath(archive.nextDate, lang)} className={linkClass}>
          {formatDayHeading(archive.nextDate, lang)} →
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}

function DayContent({ archive, lang }: { archive: DayArchive; lang: Lang }) {
  const { prefs } = usePrefs();
  const items = archive.day?.items ?? [];
  const bullets = displayTldrBullets(archive.tldr, lang);
  const heading = formatDayHeading(archive.date, lang);

  const topicByItemId = new Map<string, string>();
  const categoryByItemId = new Map<string, string>();
  const pathByItemId = new Map<string, string>();
  const tagsByItemId = new Map<string, string[]>();
  const imageByItemId = new Map<string, string>();
  for (const item of items) {
    const topic = item.tags[0] ?? item.category;
    if (topic) topicByItemId.set(item.id, topic);
    if (item.category) categoryByItemId.set(item.id, item.category);
    pathByItemId.set(item.id, storyPath(item, lang));
    if (item.tags.length > 0) tagsByItemId.set(item.id, item.tags);
    if (item.image_url) imageByItemId.set(item.id, item.image_url);
  }

  const tldr =
    bullets.length > 0 ? (
      <TldrSection
        bullets={bullets}
        defaultCount={prefs.tldrCount}
        lang={lang}
        totalStories={items.length}
        updatedAt={0}
        lastFetchedAt={null}
        topicByItemId={topicByItemId}
        categoryByItemId={categoryByItemId}
        pathByItemId={pathByItemId}
        tagsByItemId={tagsByItemId}
        imageByItemId={imageByItemId}
        snapshotDate={archive.tldr?.date}
        singleColumn={Boolean(archive.video)}
        showFreshness={false}
      />
    ) : null;

  return (
    <div>
      <DayNav archive={archive} lang={lang} />
      <h1 className="font-serif text-3xl font-medium tracking-tight">
        {heading}
      </h1>
      {archive.video ? (
        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <DayVideo
            video={archive.video}
            fallbackTitle={`AI;DR — ${heading}`}
            lang={lang}
          />
          {bullets.length > 0 && (
            // md+: the list takes the video's height and scrolls inside.
            <div className="relative min-h-[18rem]">
              <div className="md:absolute md:inset-0">
                <DayBriefing
                  bullets={bullets}
                  date={archive.date}
                  lang={lang}
                  topicByItemId={topicByItemId}
                  pathByItemId={pathByItemId}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        tldr
      )}
      {archive.day ? (
        <DaySection day={archive.day} lang={lang} />
      ) : (
        <p className="py-16 text-center text-muted-foreground">
          {lang === "vi"
            ? "Không có tin nào được đăng trong ngày này."
            : "No stories were published on this day."}
        </p>
      )}
      <DayNav archive={archive} lang={lang} />
    </div>
  );
}

function DayPage() {
  const data = Route.useLoaderData();
  const lang = useLang();
  if (data.kind === "missing") return <NotFoundPage />;
  return <DayContent archive={data.archive} lang={lang} />;
}
