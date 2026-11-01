import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { LoadErrorPage } from "../components/LoadErrorPage";
import { NotFoundPage } from "../components/NotFoundPage";
import { StoryPage as StoryPermalink } from "../components/story-page/StoryPage";
import { headRouteInput } from "../lib/head-route";
import { useLang } from "../lib/lang-context";
import { loadErrorHead, loadErrorHeaders } from "../lib/load-error";
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
    // No loaderData: the loader threw and Start answers 500. Not a 404, and
    // not the public story policy a browser could keep.
    if (!loaderData) return loadErrorHeaders(match.context.lang);
    if (loaderData.kind === "missing") {
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
    if (!loaderData) return loadErrorHead("story", match.context.lang);
    if (loaderData.kind === "missing") {
      return notFoundHead(notFoundCopy(match.context.lang).documentTitle);
    }
    return articleHead(loaderData.item, match.context.lang, {
      route: headRouteInput(match),
    });
  },
  component: StoryPage,
  errorComponent: () => <LoadErrorPage subject="story" />,
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
  return <StoryPermalink item={data.item} lang={lang} />;
}
