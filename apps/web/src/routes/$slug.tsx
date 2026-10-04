import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { NotFoundPage } from "../components/NotFoundPage";
import { StoryRow } from "../components/StoryRow";
import { ARTICLE_DATE_TAG, ARTICLE_TITLE_TAG } from "../lib/article-headings";
import { archiveDateOfSec, dayArchivePath } from "../lib/day-archive";
import { headRouteInput } from "../lib/head-route";
import { formatDayHeading } from "../lib/lang";
import { useLang } from "../lib/lang-context";
import { notFoundCopy } from "../lib/not-found";
import { NOT_FOUND_HEADER } from "../lib/not-found-status";
import { articleHead, notFoundHead } from "../lib/seo";
import { idPrefixFromSlug, storyCanonicalRedirect } from "../lib/slug";
import { fetchStory } from "../lib/story-fn";
import type { FeedItem, Lang } from "../lib/types";

type LoaderResult = { kind: "story"; item: FeedItem } | { kind: "missing" };

/** Matches /api/story/$id — published stories are public and change
 * rarely, so the permalink HTML is edge-cacheable. Missing slugs stay
 * no-store below. */
const STORY_PAGE_CACHE_CONTROL =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=3600";

export const Route = createFileRoute("/$slug")({
  loader: async ({ params, context, location }): Promise<LoaderResult> => {
    const idPrefix = idPrefixFromSlug(params.slug);
    if (!idPrefix) return { kind: "missing" };
    const item = await fetchStory({ data: { idPrefix } });
    if (!item) return { kind: "missing" };
    const to = storyCanonicalRedirect(
      params.slug,
      item,
      context.lang,
      location.searchStr,
      location.hash
    );
    if (to) throw redirect({ href: to, statusCode: 307 });
    return { kind: "story", item };
  },
  headers: ({ loaderData, match }): Record<string, string> => {
    if (loaderData?.kind === "missing") {
      return {
        [NOT_FOUND_HEADER]: "1",
        "Cache-Control": "private, no-store",
        "Content-Language": match.context.lang,
        Vary: "Cookie, Accept-Language",
      };
    }
    const explicitLocale =
      match.search.lang !== undefined && match.search.locale === undefined;
    return {
      "Cache-Control": explicitLocale
        ? STORY_PAGE_CACHE_CONTROL
        : "private, no-store",
      "Content-Language": match.context.lang,
      ...(explicitLocale ? {} : { Vary: "Cookie, Accept-Language" }),
    };
  },
  head: ({ loaderData, match }) => {
    if (!loaderData || loaderData.kind === "missing") {
      return notFoundHead(notFoundCopy(match.context.lang).documentTitle);
    }
    return articleHead(loaderData.item, match.context.lang, {
      route: headRouteInput(match),
    });
  },
  component: StoryPage,
});

function NotFoundStory({ lang }: { lang: Lang }) {
  return (
    <div className="py-16 text-center">
      <p className="text-muted-foreground">
        {lang === "vi" ? "Không tìm thấy tin." : "Story not found."}
      </p>
      <Link
        to="/"
        search={{ lang }}
        className="mt-3 inline-block text-sm text-accent underline underline-offset-2"
      >
        {lang === "vi" ? "Về trang chính" : "Back to live feed"}
      </Link>
    </div>
  );
}

function StoryContent({ item, lang }: { item: FeedItem; lang: Lang }) {
  // A row with no usable timestamp still renders; only the day heading is dropped.
  // The heading names the same Asia/Ho_Chi_Minh day the archive link opens.
  const archiveDate = archiveDateOfSec(item.published_at);

  return (
    <div>
      <div className="flex items-center justify-between py-4 text-sm">
        <Link
          to="/"
          search={{ lang }}
          className="text-muted-foreground hover:text-accent"
        >
          ← {lang === "vi" ? "Về trang chính" : "Back to live feed"}
        </Link>
        <span className="text-muted-foreground">
          1 {lang === "vi" ? "tin" : "story"}
        </span>
      </div>
      {archiveDate && (
        <div className="border-b-2 border-foreground/80 pb-2">
          <ARTICLE_DATE_TAG className="text-xl font-bold">
            <a
              href={dayArchivePath(archiveDate, lang)}
              className="hover:text-accent hover:underline"
            >
              {formatDayHeading(archiveDate, lang)}
            </a>
          </ARTICLE_DATE_TAG>
        </div>
      )}
      <StoryRow
        item={item}
        index={1}
        lang={lang}
        defaultExpanded
        titleAs={ARTICLE_TITLE_TAG}
      />
    </div>
  );
}

function StoryPage() {
  const data = Route.useLoaderData();
  const { slug } = Route.useParams();
  const lang = useLang();

  if (data.kind === "missing") {
    return idPrefixFromSlug(slug) ? (
      <NotFoundStory lang={lang} />
    ) : (
      <NotFoundPage />
    );
  }
  return <StoryContent item={data.item} lang={lang} />;
}
